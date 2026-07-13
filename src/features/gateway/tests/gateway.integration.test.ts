import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

describe("gateway integration", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  async function createBaseSetup(options?: { includeUsage?: boolean }) {
    const app = await createTestApp();
    cleanups.push(() => app.close());

    const appClientResponse = await app.inject({ method: "POST", url: "/app-clients", payload: { name: "police" } });
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

    await app.inject({ method: "POST", url: `/providers/${provider.id}/auth/api-key`, payload: { apiKey: "provider-secret-key" } });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://provider.mock.local") {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "https://provider.mock.local/chat/completions") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: Array<{ content: string }> };
        const responseBody = options?.includeUsage === false
          ? {
              id: "chatcmpl_456",
              object: "chat.completion",
              created: 1,
              model: payload.model,
              choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "sin usage" } }],
            }
          : {
              id: "chatcmpl_123",
              object: "chat.completion",
              created: 1,
              model: payload.model,
              choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `echo:${payload.messages[0]?.content ?? ""}` } }],
              usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
            };
        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "provider_req_1" },
        });
      }
      throw new Error(`Unexpected fetch url ${url}`);
    }));

    return { app, apiKey: appClientPayload.apiKey, providerId: provider.id };
  }

  it("executes chat completion, records usage/request logs, exposes metrics, and emits SSE events", async () => {
    const { app, apiKey, providerId } = await createBaseSetup();

    const events: string[] = [];
    ((app as unknown as { container: { usage: { eventBus: { subscribe: (listener: (event: { type: string }) => void) => () => void } } } }).container.usage.eventBus.subscribe((event) => {
      events.push(event.type);
    }));

    const connectionResponse = await app.inject({ method: "POST", url: `/providers/${providerId}/test-connection` });
    expect(connectionResponse.statusCode).toBe(200);

    const completionResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-client-request-id": "client_req_123",
      },
      payload: {
        model: "minimax/MiniMax-M3",
        messages: [{ role: "user", content: "Hola, respondé breve." }],
        temperature: 0.2,
        max_tokens: 500,
      },
    });

    expect(completionResponse.statusCode).toBe(200);
    const completion = completionResponse.json() as { model: string; choices: Array<{ message: { content: string } }>; usage: { total_tokens: number } };
    expect(completion.model).toBe("MiniMax-M3");
    expect(completion.choices[0]?.message.content).toContain("echo:Hola, respondé breve.");
    expect(completion.usage.total_tokens).toBe(18);
    expect(JSON.stringify(completion)).not.toContain("provider-secret-key");

    const usageOverviewResponse = await app.inject({ method: "GET", url: "/usage/overview", headers: { authorization: `Bearer ${apiKey}` } });
    const usageOverview = usageOverviewResponse.json() as { totalRequests: number; mostUsedProvider: string; totalTokens: number };
    expect(usageOverview.totalRequests).toBe(1);
    expect(usageOverview.mostUsedProvider).toBe("MiniMax");
    expect(usageOverview.totalTokens).toBe(18);

    const usageProvidersResponse = await app.inject({ method: "GET", url: "/usage/providers", headers: { authorization: `Bearer ${apiKey}` } });
    const usageProviders = usageProvidersResponse.json() as Array<{ providerName: string; requestsTotal: number }>;
    expect(usageProviders[0]?.providerName).toBe("MiniMax");
    expect(usageProviders[0]?.requestsTotal).toBe(1);

    const usageAppsResponse = await app.inject({ method: "GET", url: "/usage/apps", headers: { authorization: `Bearer ${apiKey}` } });
    const usageApps = usageAppsResponse.json() as Array<{ appName: string; requestsTotal: number }>;
    expect(usageApps[0]?.appName).toBe("police");
    expect(usageApps[0]?.requestsTotal).toBe(1);

    const usageEventsResponse = await app.inject({ method: "GET", url: "/usage/events", headers: { authorization: `Bearer ${apiKey}` } });
    const usageEvents = usageEventsResponse.json() as Array<{ usageSource: string; totalTokens: number }>;
    expect(usageEvents[0]?.usageSource).toBe("provider_reported");
    expect(usageEvents[0]?.totalTokens).toBe(18);

    expect(events).toContain("provider.health_changed");
    expect(events).toContain("request.started");
    expect(events).toContain("provider.resolved");
    expect(events).toContain("usage.final");
    expect(events).toContain("request.completed");
  });

  it("uses default provider and estimated usage when provider omits usage", async () => {
    const { app, apiKey } = await createBaseSetup({ includeUsage: false });
    const completionResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "MiniMax-M3", messages: [{ role: "user", content: "hola" }] },
    });
    expect(completionResponse.statusCode).toBe(200);
    const completion = completionResponse.json() as { usage: { total_tokens: number } };
    expect(completion.usage.total_tokens).toBeGreaterThan(0);

    const usageEventsResponse = await app.inject({ method: "GET", url: "/usage/events", headers: { authorization: `Bearer ${apiKey}` } });
    const usageEvents = usageEventsResponse.json() as Array<{ usageSource: string }>;
    expect(usageEvents[0]?.usageSource).toBe("estimated");
  });
});
