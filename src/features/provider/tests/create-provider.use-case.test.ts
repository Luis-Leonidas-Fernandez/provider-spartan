import { describe, expect, it } from "vitest";
import { createProvider } from "../domain/provider.entity.js";

describe("createProvider", () => {
  it("rejects invalid openai provider without baseUrl", () => {
    expect(() => createProvider({
      name: "OpenAI",
      providerType: "openai",
      accessMode: "api_key",
      baseUrl: null,
      defaultModel: null,
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: true,
      supportsStreaming: true,
      pricingJson: null,
      notes: null,
    })).toThrow("baseUrl is required");
  });
});
