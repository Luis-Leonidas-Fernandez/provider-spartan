import { describe, expect, it } from "vitest";
import { createUsageEvent } from "../domain/usage-event.entity.js";

describe("createUsageEvent", () => {
  it("creates a valid usage event", () => {
    const event = createUsageEvent({
      requestId: "req_1",
      appClientId: "app_1",
      providerId: "provider_1",
      modelName: "MiniMax-M3",
      inputTokens: 10,
      outputTokens: 20,
      cachedInputTokens: 0,
      totalTokens: 30,
      usageSource: "estimated",
      estimatedCostUsd: 0.01,
      finalCostUsd: null,
      pricingSnapshotJson: JSON.stringify({ inputPricePerMillion: 1, cachedInputPricePerMillion: 0, outputPricePerMillion: 2 }),
      durationMs: 123,
      status: "success",
      errorMessage: null,
    });
    expect(event.id).toBeTruthy();
    expect(event.createdAt).toBeTruthy();
  });
});
