import { describe, expect, it } from "vitest";
import { validateImageGenerationCapabilities } from "../domain/image-generation-capabilities.js";

const codexCapabilities = {
  maxImages: 1,
  supportsSize: true,
  supportsQuality: true,
  supportedResponseFormats: ["b64_json"] as const,
};

describe("validateImageGenerationCapabilities", () => {
  it("normalizes safe defaults", () => {
    expect(validateImageGenerationCapabilities({
      model: "gpt-image-1",
      prompt: "imagen",
    }, codexCapabilities)).toEqual({
      model: "gpt-image-1",
      prompt: "imagen",
      n: 1,
      response_format: "b64_json",
    });
  });

  it("rejects unsupported image counts with a stable error code", () => {
    expect(() => validateImageGenerationCapabilities({
      model: "gpt-image-1",
      prompt: "imagen",
      n: 2,
    }, codexCapabilities)).toThrow(expect.objectContaining({
      code: "image_generation_count_not_supported",
      statusCode: 422,
    }));
  });

  it("rejects unsupported response formats instead of silently ignoring them", () => {
    expect(() => validateImageGenerationCapabilities({
      model: "gpt-image-1",
      prompt: "imagen",
      response_format: "url",
    }, codexCapabilities)).toThrow(expect.objectContaining({
      code: "image_generation_response_format_not_supported",
      statusCode: 422,
    }));
  });
});
