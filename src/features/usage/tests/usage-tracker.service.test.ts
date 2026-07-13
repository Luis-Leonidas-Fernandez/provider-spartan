import { describe, expect, it } from "vitest";
import { UsageTrackerService } from "../application/services/usage-tracker.service.js";

describe("UsageTrackerService", () => {
  const service = new UsageTrackerService();

  it("extracts provider-reported usage", () => {
    const usage = service.extractUsage({
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedInputTokens: 10 },
    });
    expect(usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedInputTokens: 10 });
  });

  it("estimates usage when provider omits usage", () => {
    const usage = service.estimateUsage({ model: "x", messages: [{ role: "user", content: "Hola mundo" }] }, 40);
    expect(usage.usageSource).toBe("estimated");
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it("calculates cost from pricing snapshot", () => {
    const cost = service.calculateCost({
      inputTokens: 1000,
      outputTokens: 500,
      cachedInputTokens: 100,
      pricingSnapshotJson: JSON.stringify({ inputPricePerMillion: 2, cachedInputPricePerMillion: 1, outputPricePerMillion: 8 }),
    });
    expect(cost).toBe(0.0059);
  });
});
