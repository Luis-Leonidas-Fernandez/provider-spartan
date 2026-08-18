import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import type {
  ProviderAdapterContext,
  ProviderImageGenerationCapabilities,
  ProviderImageGenerationRequest,
  ProviderImageGenerationResponse,
} from "../../shared/provider-runtime/provider-adapter.js";

/**
 * OpenAI uses the same transport contract as any OpenAI-compatible provider.
 * Keeping this specialization explicit lets the registry route `openai/*`
 * without coupling model parsing to an infrastructure adapter name.
 */
export class OpenAIAdapter extends OpenAICompatibleAdapter {
  override readonly providerType = "openai";
  override readonly imageGenerationCapabilities: ProviderImageGenerationCapabilities = {
    maxImages: 10,
    supportsSize: true,
    supportsQuality: true,
    supportedResponseFormats: ["b64_json"],
  };

  override imageGeneration(
    request: ProviderImageGenerationRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderImageGenerationResponse> {
    const { response_format: _gatewayResponseFormat, ...openAiRequest } = request;
    return super.imageGeneration(openAiRequest, context);
  }
}
