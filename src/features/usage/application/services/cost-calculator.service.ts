import { parsePricingJson } from "../../../provider/domain/provider.entity.js";

export class CostCalculatorService {
  calculate(input: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    pricingSnapshotJson: string | null;
  }): number | null {
    if (!input.pricingSnapshotJson) return null;
    const pricing = parsePricingJson(input.pricingSnapshotJson);
    if (!pricing) return null;

    const nonCachedInputTokens = Math.max(0, input.inputTokens - input.cachedInputTokens);
    const inputCost = (nonCachedInputTokens * pricing.inputPricePerMillion) / 1_000_000;
    const cachedCost = (input.cachedInputTokens * pricing.cachedInputPricePerMillion) / 1_000_000;
    const outputCost = (input.outputTokens * pricing.outputPricePerMillion) / 1_000_000;

    return Number((inputCost + cachedCost + outputCost).toFixed(8));
  }
}
