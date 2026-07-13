import { describe, expect, it } from "vitest";
import { createProviderGatewayModule } from "./create-provider-gateway-module.js";
import { createTestDatabaseUrl } from "../test/helpers/test-db.js";

describe("createProviderGatewayModule", () => {
  it("creates the core module without Fastify", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
    });

    expect(module.gateway.handleChatCompletion).toBeTruthy();
    expect(module.usage.overview).toBeTruthy();
    expect(module.providerAuth.startProviderAuth).toBeTruthy();

    const created = await module.appClient.create.execute({ name: "youtube-summary" });
    expect(created.apiKey.startsWith("pgw_")).toBe(true);

    const overview = await module.getUsageOverview();
    expect(overview.totalRequests).toBe(0);
  });
});
