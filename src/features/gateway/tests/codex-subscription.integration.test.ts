import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

function createJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("codex subscription gateway integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes expired oauth credentials before calling Codex", async () => {
    const app = await createTestApp();

    const appClientResponse = await app.inject({ method: "POST", url: "/app-clients", payload: { name: "codex-client" } });
    const appClientPayload = appClientResponse.json() as { appClient: { id: string }; apiKey: string };

    const planResponse = await app.inject({
      method: "POST",
      url: "/subscription-plans",
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
      url: "/app-subscriptions",
      payload: {
        appClientId: appClientPayload.appClient.id,
        planId: plan.id,
        status: "active",
        startsAt: "2024-01-01T00:00:00.000Z",
      },
    });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/providers",
      payload: {
        name: "Codex",
        providerType: "codex_subscription",
        accessMode: "oauth",
        baseUrl: null,
        defaultModel: "gpt-5",
        isEnabled: true,
        isDefault: true,
        supportsUsageReporting: true,
        supportsStreaming: false,
        pricing: { inputPricePerMillion: 2, cachedInputPricePerMillion: 0, outputPricePerMillion: 8 },
      },
    });
    const providerId = (providerResponse.json() as { id: string }).id;

    await app.inject({
      method: "POST",
      url: `/providers/${providerId}/auth/oauth-token`,
      payload: {
        accessToken: "expired-access-token",
        refreshToken: "refresh-token-1",
        idToken: createJwt({ email: "luis@example.com" }),
        tokenExpiresAt: "2024-01-01T00:00:00.000Z",
        refreshTokenExists: true,
      },
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token",
        id_token: createJwt({ email: "luis@example.com" }),
        expires_in: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "resp_123",
        object: "response",
        model: "gpt-5",
        output: [{ type: "message", content: [{ type: "output_text", text: "hola desde codex" }] }],
        usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14, input_tokens_details: { cached_tokens: 0 } },
      }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_123" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${appClientPayload.apiKey}` },
      payload: { model: "codex/gpt-5", messages: [{ role: "user", content: "decí hola" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("hola desde codex");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const refreshCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const providerCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshCall[0]).toBe("https://auth.openai.com/oauth/token");
    expect((refreshCall[1].headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(providerCall[0]).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect((providerCall[1].headers as Record<string, string>).authorization).toBe("Bearer fresh-access-token");
    await app.close();
  });

  it("does not refresh imported access-token credentials and still forwards workspace metadata", async () => {
    const app = await createTestApp();

    const appClientResponse = await app.inject({ method: "POST", url: "/app-clients", payload: { name: "codex-client" } });
    const appClientPayload = appClientResponse.json() as { appClient: { id: string }; apiKey: string };
    const planResponse = await app.inject({
      method: "POST",
      url: "/subscription-plans",
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
      url: "/app-subscriptions",
      payload: {
        appClientId: appClientPayload.appClient.id,
        planId: plan.id,
        status: "active",
        startsAt: "2024-01-01T00:00:00.000Z",
      },
    });
    const providerResponse = await app.inject({
      method: "POST",
      url: "/providers",
      payload: {
        name: "Codex",
        providerType: "codex_subscription",
        accessMode: "oauth",
        baseUrl: null,
        defaultModel: "gpt-5",
        isEnabled: true,
        isDefault: true,
        supportsUsageReporting: true,
        supportsStreaming: false,
        pricing: { inputPricePerMillion: 2, cachedInputPricePerMillion: 0, outputPricePerMillion: 8 },
      },
    });
    const providerId = (providerResponse.json() as { id: string }).id;

    await app.inject({
      method: "POST",
      url: `/providers/${providerId}/auth/oauth-token`,
      payload: {
        accessToken: createJwt({
          email: "luis@example.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
          "https://api.openai.com/auth": {
            chatgpt_account_id: "ws_access_123",
            chatgpt_plan_type: "plus",
          },
        }),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "resp_123",
      object: "response",
      model: "gpt-5",
      output: [{ type: "message", content: [{ type: "output_text", text: "hola access token" }] }],
      usage: { input_tokens: 9, output_tokens: 3, total_tokens: 12, input_tokens_details: { cached_tokens: 0 } },
    }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_123" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${appClientPayload.apiKey}` },
      payload: { model: "codex/gpt-5", messages: [{ role: "user", content: "decí hola" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [providerUrl, providerInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(providerUrl).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect((providerInit.headers as Record<string, string>)["chatgpt-account-id"]).toBe("ws_access_123");
    await app.close();
  });
});
