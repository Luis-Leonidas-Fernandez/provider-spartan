import type { GatewayChatCompletionRequest } from "../../../gateway/domain/gateway.types.js";

export class TokenEstimatorService {
  estimateFromText(text: string) {
    return Math.ceil(text.length / 4);
  }

  estimateRequestTokens(request: GatewayChatCompletionRequest) {
    const serialized = JSON.stringify({ model: request.model, messages: request.messages });
    return this.estimateFromText(serialized);
  }

  estimateResponseTokens(responseText: string) {
    return this.estimateFromText(responseText);
  }
}
