import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleProviderConnectionRepository } from "../../../provider-auth/infrastructure/drizzle-provider-connection.repository.js";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

function createJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

async function createConnectedCodex(app: Awaited<ReturnType<typeof createTestApp>>) {
  const startResponse = await app.inject({ method: "GET", url: "/codex/connect" });
  expect(startResponse.statusCode).toBe(302);
  const redirectLocation = startResponse.headers.location;
  expect(redirectLocation).toBeTruthy();
  const authorizationUrl = new URL(String(redirectLocation));
  const state = authorizationUrl.searchParams.get("state");
  expect(state).toBeTruthy();

  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    access_token: "connected-access-token",
    refresh_token: "connected-refresh-token",
    id_token: createJwt({
      email: "luis@example.com",
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
    url: `/auth/callback?state=${encodeURIComponent(String(state))}&code=oauth-code-123`,
  });
  expect(callbackResponse.statusCode).toBe(200);
  vi.unstubAllGlobals();
  const statusResponse = await app.inject({ method: "GET", url: "/codex/status" });
  const statusBody = statusResponse.json() as { providerId: string };
  return statusBody.providerId;
}

async function getCodexConnectionRepository(app: Awaited<ReturnType<typeof createTestApp>>) {
  const module = (app as unknown as { providerGatewayModule: { database: { db: unknown } } }).providerGatewayModule;
  return new DrizzleProviderConnectionRepository(module.database.db as never);
}

describe("codex routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CODEX_REQUEST_AUDIT_DIR;
  });

  it("returns disconnected codex status before auth", async () => {
    const app = await createTestApp();

    const response = await app.inject({ method: "GET", url: "/codex/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: false,
      reconnectRequired: true,
      reason: "not_connected",
      message: "Provider is not connected",
      provider: "codex-subscription",
      providerType: "codex_subscription",
      authMethod: "oauth_token",
      runtimeSurface: "codex_subscription",
      identityModel: {
        scope: "per_connection",
        sharedByAllClients: false,
      },
      defaultModel: "gpt-5.3-codex",
      providerId: null,
      loginStatus: "unknown",
      accountModelDiscovery: null,
    });
    await app.close();
  });

  it("returns connected codex status after auth", async () => {
    const app = await createTestApp();
    const providerId = await createConnectedCodex(app);

    const response = await app.inject({ method: "GET", url: "/codex/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: true,
      reconnectRequired: false,
      reason: null,
      message: "Connection active",
      provider: "codex-subscription",
      providerType: "codex_subscription",
      authMethod: "oauth_token",
      runtimeSurface: "codex_subscription",
      identityModel: {
        scope: "per_connection",
        sharedByAllClients: false,
      },
      defaultModel: "gpt-5.3-codex",
      providerId,
      loginStatus: "authenticated",
      refreshTokenExists: true,
      accountEmail: "luis@example.com",
      chatgptAccountId: "ws_123",
      chatgptPlanType: "plus",
      accountModelDiscovery: null,
    });
    await app.close();
  });

  it("lists codex models with a symmetric model catalog shape", async () => {
    const app = await createTestApp();
    const providerId = await createConnectedCodex(app);

    const response = await app.inject({ method: "GET", url: "/codex/models" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "codex-subscription",
      providerId,
      connected: true,
      runtimeSurface: "codex_subscription",
      discoverySource: "codex_static_fallback",
      knownModels: expect.arrayContaining(["gpt-5.3-codex"]),
      recommendedModel: "gpt-5.3-codex",
      recommendedLabels: {
        quality: "gpt-5.3-codex",
      },
    });
    expect(response.json().availableModels[0]).toMatchObject({
      label: "gpt-5.3-codex",
      runtimeModel: "gpt-5.3-codex",
      family: "codex",
    });
    await app.close();
  });

  it("tests codex connection without provider id", async () => {
    const app = await createTestApp();
    await createConnectedCodex(app);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({ method: "POST", url: "/codex/test-connection" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      status: "healthy",
      message: "Codex subscription reachable",
    });
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toContain("/backend-api/wham/usage");
    expect((init.headers as Record<string, string>)["chatgpt-account-id"]).toBe("ws_123");
    await app.close();
  });

  it("returns connectUrl when codex is not connected", async () => {
    const app = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/codex/test-message",
      payload: { message: "hola" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "provider_connection_not_connected",
      message: "Provider connection for codex is not connected",
      connectUrl: "/codex/connect",
    });
    await app.close();
  });

  it("disconnects codex and clears local auth state", async () => {
    const app = await createTestApp();
    const providerId = await createConnectedCodex(app);

    const response = await app.inject({ method: "DELETE", url: "/codex/disconnect" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      disconnected: true,
      providerId,
    });

    const statusResponse = await app.inject({ method: "GET", url: "/codex/status" });
    expect((statusResponse.json() as { connected: boolean; loginStatus: string }).connected).toBe(false);
    expect((statusResponse.json() as { connected: boolean; loginStatus: string }).loginStatus).toBe("unknown");
    await app.close();
  });

  it("surfaces expired lifecycle through /codex/status and /codex/test-message", async () => {
    const app = await createTestApp();
    await createConnectedCodex(app);
    const connectionRepository = await getCodexConnectionRepository(app);
    const providerStatus = await app.inject({ method: "GET", url: "/auth/codex/status" });
    const connection = (providerStatus.json() as { connection: { id: string } }).connection;
    const existing = await connectionRepository.findById(connection.id);
    if (!existing) throw new Error("Expected codex connection");

    await connectionRepository.update({
      ...existing,
      encryptedRefreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      status: "connected",
    });

    const statusResponse = await app.inject({ method: "GET", url: "/codex/status" });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      connected: false,
      reconnectRequired: true,
      reason: "expired",
      message: "Connection expired. Reconnect required.",
      loginStatus: "expired",
    });

    const testMessageResponse = await app.inject({
      method: "POST",
      url: "/codex/test-message",
      payload: { message: "hola" },
    });
    expect(testMessageResponse.statusCode).toBe(401);
    expect(testMessageResponse.json()).toMatchObject({
      error: "provider_connection_expired",
      connectUrl: "/codex/connect",
    });

    await app.close();
  });

  it("surfaces refresh_failed lifecycle through /codex/test-connection", async () => {
    const app = await createTestApp();
    await createConnectedCodex(app);
    const connectionRepository = await getCodexConnectionRepository(app);
    const providerStatus = await app.inject({ method: "GET", url: "/auth/codex/status" });
    const connection = (providerStatus.json() as { connection: { id: string } }).connection;
    const existing = await connectionRepository.findById(connection.id);
    if (!existing) throw new Error("Expected codex connection");

    await connectionRepository.update({
      ...existing,
      status: "refresh_failed",
    });

    const response = await app.inject({ method: "POST", url: "/codex/test-connection" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "provider_connection_reconnect_required",
      connectUrl: "/codex/connect",
    });

    await app.close();
  });

  it("sends a codex test message and writes sanitized request audit", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-codex-request-audit-"));
    process.env.CODEX_REQUEST_AUDIT_DIR = auditDirectory;
    const app = await createTestApp();
    await createConnectedCodex(app);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "resp_123",
      object: "response",
      created_at: 123,
      model: "gpt-5.3-codex",
      output_text: "conectado",
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        total_tokens: 18,
        input_tokens_details: { cached_tokens: 2 },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_codex_123" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/codex/test-message",
      payload: {
        message: "Respondé solo: conectado",
        system: "Sos breve",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      model: "gpt-5.3-codex",
      runtimeModel: "gpt-5.3-codex",
      catalogModelKey: "gpt-5.3-codex",
      content: "conectado",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        cachedInputTokens: 2,
      },
      providerRequestId: "req_codex_123",
    });

    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toContain("/backend-api/codex/responses");
    expect(String(init.body)).toContain("gpt-5.3-codex");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer connected-access-token");
    expect((init.headers as Record<string, string>)["chatgpt-account-id"]).toBe("ws_123");

    const files = await fs.readdir(auditDirectory);
    expect(files).toHaveLength(1);
    const payload = JSON.parse(await fs.readFile(path.join(auditDirectory, files[0]!), "utf8")) as Record<string, unknown>;
    expect(payload.phase).toBe("test_message_success");
    expect(JSON.stringify(payload)).toContain("\"usage\"");
    expect(JSON.stringify(payload)).toContain("\"latencyMs\"");
    expect(JSON.stringify(payload)).toContain("\"accountModelDiscovery\":null");
    expect(JSON.stringify(payload)).not.toContain("connected-access-token");
    expect(JSON.stringify(payload)).not.toContain("connected-refresh-token");
    expect(JSON.stringify(payload)).not.toContain("Respondé solo: conectado");
    expect(JSON.stringify(payload)).not.toContain("conectado\"");

    await app.close();
  });

  it("normalizes general gpt-5 to the Codex model for test messages", async () => {
    const app = await createTestApp();
    await createConnectedCodex(app);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "gpt-5.3-codex",
      output_text: "conectado",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/codex/test-message",
      payload: {
        message: "Respondé solo: conectado",
        model: "gpt-5",
      },
    });

    expect(response.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain("gpt-5.3-codex");
    expect(String(init.body)).not.toContain("\"gpt-5\"");

    await app.close();
  });
});
