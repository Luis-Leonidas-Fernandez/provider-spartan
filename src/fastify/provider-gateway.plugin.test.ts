import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { providerGatewayPlugin } from "./provider-gateway.plugin.js";
import { createTestDatabaseUrl } from "../test/helpers/test-db.js";

async function createHostApp() {
  const app = Fastify({ logger: false });
  await app.register(providerGatewayPlugin, {
    prefix: "/provider-gateway",
    databaseUrl: createTestDatabaseUrl(),
    appApiKeyPepper: "test-pepper",
    credentialEncryptionKey: "test-encryption-secret",
    allowInsecureCredentialStorage: false,
    logLevel: "error",
    appEnv: "test",
  });
  return app;
}

describe("providerGatewayPlugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts routes under a configurable prefix and serves chat completions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://provider.mock.local/chat/completions") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as { model: string };
        return new Response(JSON.stringify({
          id: "chatcmpl_embedded",
          object: "chat.completion",
          created: 1,
          model: payload.model,
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hola embed" } }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_embed_1" } });
      }
      if (url === "https://provider.mock.local") {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch url ${url}`);
    }));

    const app = await createHostApp();

    const appClientResponse = await app.inject({ method: "POST", url: "/provider-gateway/app-clients", payload: { name: "youtube-summary" } });
    const appClientPayload = appClientResponse.json() as { appClient: { id: string }; apiKey: string };

    const planResponse = await app.inject({
      method: "POST",
      url: "/provider-gateway/subscription-plans",
      payload: {
        name: "starter",
        monthlyRequestLimit: 100,
        monthlyTokenLimit: 100000,
        monthlyBudgetUsd: 20,
        allowedProvidersJson: "[]",
        allowedModelsJson: "[]",
        isActive: true,
      },
    });
    const plan = planResponse.json() as { id: string };

    await app.inject({
      method: "POST",
      url: "/provider-gateway/app-subscriptions",
      payload: {
        appClientId: appClientPayload.appClient.id,
        planId: plan.id,
        status: "active",
        startsAt: "2024-01-01T00:00:00.000Z",
      },
    });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/provider-gateway/providers",
      payload: {
        name: "MiniMax",
        providerType: "minimax",
        accessMode: "api_key",
        baseUrl: "https://provider.mock.local",
        defaultModel: "MiniMax-M3",
        isEnabled: true,
        isDefault: true,
        supportsUsageReporting: true,
        supportsStreaming: false,
        pricing: { inputPricePerMillion: 2, cachedInputPricePerMillion: 0, outputPricePerMillion: 8 },
      },
    });
    const provider = providerResponse.json() as { id: string };

    await app.inject({ method: "POST", url: `/provider-gateway/providers/${provider.id}/auth/api-key`, payload: { apiKey: "provider-secret-key" } });

    const completionResponse = await app.inject({
      method: "POST",
      url: "/provider-gateway/v1/chat/completions",
      headers: { authorization: `Bearer ${appClientPayload.apiKey}` },
      payload: { model: "minimax/MiniMax-M3", messages: [{ role: "user", content: "hola" }] },
    });

    expect(completionResponse.statusCode).toBe(200);
    expect(completionResponse.json()).toEqual(expect.objectContaining({ model: "MiniMax-M3" }));

    const overviewResponse = await app.inject({ method: "GET", url: "/provider-gateway/usage/overview", headers: { authorization: `Bearer ${appClientPayload.apiKey}` } });
    expect(overviewResponse.statusCode).toBe(200);
    expect(overviewResponse.json()).toEqual(expect.objectContaining({ totalRequests: 1 }));

    await app.close();
  });


  it("uses the mounted host prefix when building embedded provider-auth callbacks", async () => {
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      prefix: "/provider-gateway",
      publicBaseUrl: "http://host-app.local",
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
    });

    const response = await app.inject({ method: "GET", url: "/provider-gateway/auth/codex/start" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { authorizationUrl: string };
    const authorizationUrl = new URL(body.authorizationUrl);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("http://host-app.local/provider-gateway/auth/codex/callback");

    await app.close();
  });

  it("can mount using a prebuilt module only", async () => {
    const { createProviderGatewayModule } = await import("../core/create-provider-gateway-module.js");
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
    });

    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      prefix: "/provider-gateway",
      module,
    });

    const response = await app.inject({ method: "GET", url: "/provider-gateway/health" });
    expect(response.statusCode).toBe(200);

    await app.close();
  });

});
