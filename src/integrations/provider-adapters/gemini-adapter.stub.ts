import type { ProviderAdapter, ProviderAdapterContext, ProviderChatCompletionRequest, ProviderChatCompletionResponse, ProviderConnectionResult } from "../../shared/provider-runtime/provider-adapter.js";

export class GeminiAdapterStub implements ProviderAdapter {
  readonly providerType = "gemini";
  async chatCompletion(_request: ProviderChatCompletionRequest, _context: ProviderAdapterContext): Promise<ProviderChatCompletionResponse> {
    return { ok: false, status: "failed", model: "", content: "", durationMs: 0, error: "Gemini adapter is not implemented yet." };
  }
  async testConnection(_context: ProviderAdapterContext): Promise<ProviderConnectionResult> {
    return { ok: false, status: "down", latencyMs: 0, message: "Adapter not implemented" };
  }
}
