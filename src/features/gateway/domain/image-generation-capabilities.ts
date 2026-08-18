import { AppError } from "../../../core/errors.js";
import type {
  ProviderImageGenerationCapabilities,
  ProviderImageGenerationRequest,
} from "../../../shared/provider-runtime/provider-adapter.js";

export function validateImageGenerationCapabilities(
  request: ProviderImageGenerationRequest,
  capabilities: ProviderImageGenerationCapabilities,
): ProviderImageGenerationRequest {
  const imageCount = request.n ?? 1;
  if (imageCount > capabilities.maxImages) {
    throw new AppError(
      `This provider supports at most ${capabilities.maxImages} image(s) per request`,
      422,
      "image_generation_count_not_supported",
    );
  }
  if (request.size && !capabilities.supportsSize) {
    throw new AppError(
      "This provider does not support the image size parameter",
      422,
      "image_generation_size_not_supported",
    );
  }
  if (request.quality && !capabilities.supportsQuality) {
    throw new AppError(
      "This provider does not support the image quality parameter",
      422,
      "image_generation_quality_not_supported",
    );
  }

  const responseFormat = request.response_format ?? "b64_json";
  if (!capabilities.supportedResponseFormats.includes(responseFormat)) {
    throw new AppError(
      `This provider does not support response_format=${responseFormat}`,
      422,
      "image_generation_response_format_not_supported",
    );
  }

  return {
    ...request,
    n: imageCount,
    response_format: responseFormat,
  };
}
