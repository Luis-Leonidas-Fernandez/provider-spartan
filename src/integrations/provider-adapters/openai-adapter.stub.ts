import type { ProviderAdapter, ProviderAdapterContext, ProviderChatCompletionRequest, ProviderChatCompletionResponse, ProviderConnectionResult } from "../../shared/provider-runtime/provider-adapter.js";

export class OpenAIAdapterStub implements ProviderAdapter {
  readonly providerType = "openai";
  async chatCompletion(_request: ProviderChatCompletionRequest, _context: ProviderAdapterContext): Promise<ProviderChatCompletionResponse> {
    return { ok: false, status: "failed", model: "", content: "", durationMs: 0, error: "OpenAI dedicated adapter is not implemented yet. Use custom_openai_compatible if applicable." };
  }
  async testConnection(_context: ProviderAdapterContext): Promise<ProviderConnectionResult> {
    return { ok: false, status: "down", latencyMs: 0, message: "Adapter not implemented" };
  }
}
