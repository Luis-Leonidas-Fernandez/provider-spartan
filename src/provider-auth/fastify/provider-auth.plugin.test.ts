import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderGatewayModule } from "../../core/create-provider-gateway-module.js";
import { createTestDatabaseUrl } from "../../test/helpers/test-db.js";
import { providerAuthPlugin } from "./provider-auth.plugin.js";

function createJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("providerAuthPlugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts host oauth routes under a configurable prefix", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
    });

    const app = Fastify({ logger: false });
    await app.register(providerAuthPlugin, {
      prefix: "/provider-gateway/auth",
      routePrefix: "/provider-gateway/auth",
      publicBaseUrl: "http://localhost:3000",
      module: module.providerAuth,
    });

    const startResponse = await app.inject({
      method: "GET",
      url: "/provider-gateway/auth/codex/start",
    });

    expect(startResponse.statusCode).toBe(200);
    const startBody = startResponse.json() as { authorizationUrl: string; state: string };
    expect(startBody.authorizationUrl).toContain(
      encodeURIComponent("http://localhost:3000/provider-gateway/auth/codex/callback"),
    );
    expect(startBody.state).toBeTruthy();

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "host-access-token",
      refresh_token: "host-refresh-token",
      id_token: createJwt({
        email: "host@example.com",
        "https://api.openai.com/auth": {
          chatgpt_account_id: "ws_host",
          chatgpt_plan_type: "plus",
        },
      }),
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await app.inject({
      method: "GET",
      url: `/provider-gateway/auth/codex/callback?state=${encodeURIComponent(startBody.state)}&code=oauth-code-123`,
    });

    expect(callbackResponse.statusCode).toBe(200);
    expect(callbackResponse.json()).toMatchObject({
      connected: true,
      connection: {
        providerType: "codex",
        authType: "oauth_token",
        status: "connected",
      },
    });

    const statusResponse = await app.inject({
      method: "GET",
      url: "/provider-gateway/auth/codex/status",
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      connected: true,
      connection: {
        status: "connected",
      },
    });

    const secondCallbackResponse = await app.inject({
      method: "GET",
      url: `/provider-gateway/auth/codex/callback?state=${encodeURIComponent(startBody.state)}&code=oauth-code-456`,
    });
    expect(secondCallbackResponse.statusCode).toBe(401);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/provider-gateway/auth/codex/logout",
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toMatchObject({
      loggedOut: true,
    });

    const disconnectedStatusResponse = await app.inject({
      method: "GET",
      url: "/provider-gateway/auth/codex/status",
    });
    expect(disconnectedStatusResponse.statusCode).toBe(200);
    expect(disconnectedStatusResponse.json()).toEqual({
      connected: false,
      reconnectRequired: true,
      message: "Provider is not connected",
      reason: "not_connected",
      connection: null,
    });

    await app.close();
  });

  it("supports gemini auth through host routes", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
    });

    const app = Fastify({ logger: false });
    await app.register(providerAuthPlugin, {
      prefix: "/provider-gateway/auth",
      routePrefix: "/provider-gateway/auth",
      publicBaseUrl: "http://localhost:3000",
      module: module.providerAuth,
    });

    const startResponse = await app.inject({
      method: "GET",
      url: "/provider-gateway/auth/gemini/start",
    });

    expect(startResponse.statusCode).toBe(200);
    const startBody = startResponse.json() as { authorizationUrl: string; state: string };
    expect(startBody.authorizationUrl).toContain("accounts.google.com");
    expect(startBody.authorizationUrl).toContain(
      encodeURIComponent("http://localhost:3000/provider-gateway/auth/gemini/callback"),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({
          access_token: "gemini-access-token",
          refresh_token: "gemini-refresh-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.startsWith("https://www.googleapis.com/oauth2/v1/userinfo")) {
        return new Response(JSON.stringify({
          email: "gemini@example.com",
          name: "Gemini User",
          id: "google-sub-123",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist") {
        return new Response(JSON.stringify({
          cloudaicompanionProject: { id: "project-123" },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await app.inject({
      method: "GET",
      url: `/provider-gateway/auth/gemini/callback?state=${encodeURIComponent(startBody.state)}&code=oauth-code-123`,
    });
    expect(callbackResponse.statusCode).toBe(200);
    expect(callbackResponse.json()).toMatchObject({
      connected: true,
      connection: {
        providerType: "gemini",
        authType: "oauth_token",
        status: "connected",
      },
    });

    const statusResponse = await app.inject({
      method: "GET",
      url: "/provider-gateway/auth/gemini/status",
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      connected: true,
      connection: {
        status: "connected",
      },
    });

    await app.close();
  });

  it("can block provider auth routes for a provider", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
    });

    const app = Fastify({ logger: false });
    await app.register(providerAuthPlugin, {
      prefix: "/provider-gateway/auth",
      routePrefix: "/provider-gateway/auth",
      publicBaseUrl: "http://localhost:3000",
      module: module.providerAuth,
      blockedProviders: {
        "blocked-provider": "Blocked provider message",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/provider-gateway/auth/blocked-provider/start",
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: "Gone",
      message: "Blocked provider message",
    });

    await app.close();
  });
});
