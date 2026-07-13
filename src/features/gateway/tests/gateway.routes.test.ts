import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

describe("gateway route guards", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  async function setupBase() {
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

    const subscriptionResponse = await app.inject({
      method: "POST",
      url: "/app-subscriptions",
      payload: {
        appClientId: appClientPayload.appClient.id,
        planId: plan.id,
        status: "active",
        startsAt: "2024-01-01T00:00:00.000Z",
      },
    });
    const subscription = subscriptionResponse.json() as { id: string };

    const providerResponse = await app.inject({
      method: "POST",
      url: "/providers",
      payload: {
        name: "MiniMax",
        providerType: "minimax",
        accessMode: "api_key",
        baseUrl: "http://127.0.0.1:65530",
        defaultModel: "MiniMax-M3",
        isEnabled: true,
        isDefault: true,
        supportsUsageReporting: true,
        supportsStreaming: false,
        pricing: { inputPricePerMillion: 2, cachedInputPricePerMillion: 0, outputPricePerMillion: 8 },
      },
    });
    const provider = providerResponse.json() as { id: string };

    return { app, apiKey: appClientPayload.apiKey, appClientId: appClientPayload.appClient.id, subscriptionId: subscription.id, providerId: provider.id };
  }

  it("blocks inactive app clients", async () => {
    const ctx = await setupBase();
    await ctx.app.inject({ method: "PUT", url: `/app-clients/${ctx.appClientId}`, payload: { isActive: false } });
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${ctx.apiKey}` },
      payload: { model: "MiniMax-M3", messages: [{ role: "user", content: "hola" }] },
    });
    expect(response.statusCode).toBe(401);
  });

  it("blocks inactive subscriptions", async () => {
    const ctx = await setupBase();
    await ctx.app.inject({ method: "PUT", url: `/app-subscriptions/${ctx.subscriptionId}`, payload: { status: "inactive" } });
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${ctx.apiKey}` },
      payload: { model: "MiniMax-M3", messages: [{ role: "user", content: "hola" }] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("subscription");
  });

  it("blocks disabled providers", async () => {
    const ctx = await setupBase();
    await ctx.app.inject({ method: "PUT", url: `/providers/${ctx.providerId}`, payload: { isEnabled: false } });
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${ctx.apiKey}` },
      payload: { model: "MiniMax-M3", messages: [{ role: "user", content: "hola" }] },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks providers without required credential", async () => {
    const ctx = await setupBase();
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${ctx.apiKey}` },
      payload: { model: "MiniMax-M3", messages: [{ role: "user", content: "hola" }] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("credential");
  });
});
