import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createTestDatabaseUrl } from "../test/helpers/test-db.js";
import { createProviderGatewayNodeServer } from "./provider-gateway.node.js";

function baseOptions() {
  return {
    databaseUrl: createTestDatabaseUrl(),
    appApiKeyPepper: "test-pepper",
    credentialEncryptionKey: "test-encryption-secret",
    allowInsecureCredentialStorage: false,
    providerAuthLifecycleAuditDir: "",
    codexOAuthAuditDir: "",
    codexRequestAuditDir: "",
    codexAccountDiscoveryDir: "",
    geminiRequestAuditDir: "",
    claudeRequestAuditDir: "",
    runMigrations: true,
  };
}

describe("createProviderGatewayNodeServer", () => {
  it("serves provider-gateway routes through a Node http server", async () => {
    const adapter = await createProviderGatewayNodeServer(baseOptions());
    adapter.server.listen(0, "127.0.0.1");
    await once(adapter.server, "listening");

    try {
      const address = adapter.server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address");

      const response = await fetch(`http://127.0.0.1:${address.port}/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      await adapter.close();
    }
  });

  it("can strip a Node mount path before forwarding to the internal router", async () => {
    const adapter = await createProviderGatewayNodeServer({
      ...baseOptions(),
      mountPath: "/provider-gateway",
    });
    adapter.server.listen(0, "127.0.0.1");
    await once(adapter.server, "listening");

    try {
      const address = adapter.server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address");

      const response = await fetch(`http://127.0.0.1:${address.port}/provider-gateway/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      await adapter.close();
    }
  });
});

