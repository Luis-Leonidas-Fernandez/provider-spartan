import type { ProviderChatCompletionResponse, ProviderUsage } from "../../../../shared/provider-runtime/provider-adapter.js";
import type { GatewayChatCompletionRequest } from "../../../gateway/domain/gateway.types.js";
import type { CanonicalUsage } from "../../domain/usage.types.js";
import { TokenEstimatorService } from "./token-estimator.service.js";
import { CostCalculatorService } from "./cost-calculator.service.js";

export class UsageTrackerService {
  constructor(
    private readonly estimator = new TokenEstimatorService(),
    private readonly costCalculator = new CostCalculatorService(),
  ) {}

  extractUsage(responseOrChunk: { usage?: ProviderUsage | undefined }) {
    return responseOrChunk.usage;
  }

  canonicalizeUsage(rawUsage: ProviderUsage): CanonicalUsage {
    return {
      inputTokens: Math.max(0, rawUsage.promptTokens),
      outputTokens: Math.max(0, rawUsage.completionTokens),
      cachedInputTokens: Math.max(0, rawUsage.cachedInputTokens ?? 0),
      totalTokens: Math.max(0, rawUsage.totalTokens || (rawUsage.promptTokens + rawUsage.completionTokens)),
      usageSource: "provider_reported",
    };
  }

  estimateUsage(request: GatewayChatCompletionRequest, responseTextLength: number): CanonicalUsage {
    const inputTokens = this.estimator.estimateRequestTokens(request);
    const outputTokens = this.estimator.estimateResponseTokens("x".repeat(responseTextLength));
    return {
      inputTokens,
      outputTokens,
      cachedInputTokens: 0,
      totalTokens: inputTokens + outputTokens,
      usageSource: "estimated",
    };
  }

  buildUsage(request: GatewayChatCompletionRequest, providerResponse: ProviderChatCompletionResponse): CanonicalUsage {
    const extracted = this.extractUsage(providerResponse);
    if (extracted) {
      return this.canonicalizeUsage(extracted);
    }
    return this.estimateUsage(request, providerResponse.content.length);
  }

  calculateCost(input: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    pricingSnapshotJson: string | null;
  }) {
    return this.costCalculator.calculate(input);
  }
}
