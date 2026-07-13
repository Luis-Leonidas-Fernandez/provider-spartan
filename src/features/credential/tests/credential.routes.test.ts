import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

async function createProvider(app: Awaited<ReturnType<typeof createTestApp>>) {
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
      isDefault: false,
      supportsUsageReporting: true,
      supportsStreaming: true,
      notes: null,
    },
  });
  return response.json().id as string;
}

describe("credential routes", () => {
  it("stores credential without exposing encrypted value", async () => {
    const app = await createTestApp();
    const providerId = await createProvider(app);
    const response = await app.inject({ method: "POST", url: `/providers/${providerId}/auth/api-key`, payload: { apiKey: "secret-token" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().encryptedValue).toBeUndefined();
    expect(response.json().maskedValue).toContain("***");
    await app.close();
  });

  it("stores oauth token metadata for codex subscriptions", async () => {
    const app = await createTestApp();
    const providerId = await createProvider(app);
    await app.inject({
      method: "PUT",
      url: `/providers/${providerId}`,
      payload: { providerType: "codex_subscription", accessMode: "oauth", baseUrl: null },
    });

    const response = await app.inject({
      method: "POST",
      url: `/providers/${providerId}/auth/oauth-token`,
      payload: {
        accessToken: "oauth-access-token",
        workspaceId: "ws_123",
        accountEmail: "luis@example.com",
        planType: "plus",
        refreshTokenExists: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().credentialType).toBe("oauth_token");
    expect(response.json().refreshTokenExists).toBe(true);
    expect(response.json().metadataJson).toContain("\"workspaceId\":\"ws_123\"");
    await app.close();
  });
});
