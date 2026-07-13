import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

function createJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

async function createCodexProvider(app: Awaited<ReturnType<typeof createTestApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/providers",
    payload: {
      name: "Codex",
      providerType: "codex_subscription",
      accessMode: "oauth",
      baseUrl: null,
      defaultModel: "gpt-5",
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: true,
      supportsStreaming: false,
      notes: null,
    },
  });
  return response.json().id as string;
}

describe("credential oauth routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses /codex/connect as the single human entrypoint and auto-creates the provider", async () => {
    const app = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/codex/connect" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("https://auth.openai.com/oauth/authorize");
    expect(response.headers.location).toContain(encodeURIComponent("http://localhost:1455/auth/callback"));

    const providersResponse = await app.inject({ method: "GET", url: "/providers" });
    const providers = providersResponse.json() as Array<Record<string, unknown>>;
    expect(providers.some((provider) => provider.providerType === "codex_subscription")).toBe(true);
    await app.close();
  });

  it("starts codex oauth and completes callback", async () => {
    const app = await createTestApp();
    const providerId = await createCodexProvider(app);

    const startResponse = await app.inject({ method: "GET", url: `/providers/${providerId}/oauth/start` });
    expect(startResponse.statusCode).toBe(200);
    const startBody = startResponse.json() as { state: string; authorizationUrl: string };
    expect(startBody.authorizationUrl).toContain("auth.openai.com/oauth/authorize");
    expect(startBody.authorizationUrl).toContain(encodeURIComponent("http://localhost:1455/auth/callback"));

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      id_token: createJwt({
        email: "luis@example.com",
        name: "Luis",
        "https://api.openai.com/auth": {
          chatgpt_account_id: "ws_123",
          chatgpt_plan_type: "plus",
        },
      }),
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await app.inject({
      method: "GET",
      url: `/auth/callback?state=${encodeURIComponent(startBody.state)}&code=oauth-code-123`,
    });

    expect(callbackResponse.statusCode).toBe(200);
    const callbackBody = callbackResponse.json() as Record<string, unknown>;
    expect(callbackBody.credentialType).toBe("oauth_token");
    expect(callbackBody.refreshTokenExists).toBe(true);
    expect(String(callbackBody.metadataJson)).toContain("luis@example.com");
    expect(String(callbackBody.metadataJson)).toContain("ws_123");
    expect(callbackBody.lastRefreshAt).toBeTruthy();
    expect(callbackBody.encryptedValue).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toContain("grant_type=authorization_code");

    const connectionStatusResponse = await app.inject({ method: "GET", url: "/auth/codex/status" });
    expect(connectionStatusResponse.statusCode).toBe(200);
    expect(connectionStatusResponse.json()).toMatchObject({
      connected: true,
      connection: {
        providerId,
        authType: "oauth_token",
        status: "connected",
      },
    });
    await app.close();
  });

  it("restarting /codex/connect invalidates previous oauth state for the same provider", async () => {
    const app = await createTestApp();

    const firstResponse = await app.inject({ method: "GET", url: "/codex/connect" });
    const firstUrl = new URL(String(firstResponse.headers.location));
    const firstState = firstUrl.searchParams.get("state");

    const secondResponse = await app.inject({ method: "GET", url: "/codex/connect" });
    const secondUrl = new URL(String(secondResponse.headers.location));
    const secondState = secondUrl.searchParams.get("state");

    expect(firstState).toBeTruthy();
    expect(secondState).toBeTruthy();
    expect(secondState).not.toBe(firstState);

    const firstCallback = await app.inject({
      method: "GET",
      url: `/auth/callback?state=${encodeURIComponent(String(firstState))}&code=oauth-code-old`,
    });
    expect(firstCallback.statusCode).toBe(401);

    await app.close();
  });
});
