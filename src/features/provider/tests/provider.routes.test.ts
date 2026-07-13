import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

describe("provider routes", () => {
  it("creates provider and sets default", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/providers",
      payload: {
        name: "OpenAI",
        providerType: "openai",
        accessMode: "api_key",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4.1",
        isEnabled: true,
        isDefault: true,
        supportsUsageReporting: true,
        supportsStreaming: true,
        notes: null,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().isDefault).toBe(true);
    await app.close();
  });

  it("creates codex subscription provider without custom base url", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/providers",
      payload: {
        name: "Codex",
        providerType: "codex_subscription",
        accessMode: "oauth",
        defaultModel: "gpt-5",
        isEnabled: true,
        isDefault: false,
        supportsUsageReporting: true,
        supportsStreaming: false,
        notes: "oauth-backed subscription",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().providerType).toBe("codex_subscription");
    await app.close();
  });
});
