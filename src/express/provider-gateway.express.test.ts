import { describe, expect, it } from "vitest";
import { createTestDatabaseUrl } from "../test/helpers/test-db.js";
import { createProviderGatewayExpressAdapter, createProviderGatewayExpressRouter, type ExpressMiddleware } from "./provider-gateway.express.js";

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

describe("provider-gateway Express adapter", () => {
  it("creates a router without depending on express at package runtime", async () => {
    const handlers: ExpressMiddleware[] = [];
    const express = {
      Router() {
        return {
          use(handler: ExpressMiddleware) {
            handlers.push(handler);
          },
        };
      },
    };

    const adapter = createProviderGatewayExpressAdapter(express, {
      ...baseOptions(),
      mountPath: "/provider-gateway",
    });

    try {
      expect(adapter.router).toBeDefined();
      expect(adapter.middleware).toBe(handlers[0]);
      expect(handlers).toHaveLength(1);
    } finally {
      await adapter.close();
    }
  });

  it("offers a convenience router factory", () => {
    const handlers: ExpressMiddleware[] = [];
    const express = {
      Router() {
        return {
          use(handler: ExpressMiddleware) {
            handlers.push(handler);
          },
        };
      },
    };

    const router = createProviderGatewayExpressRouter(express, {
      ...baseOptions(),
      mountPath: "/provider-gateway",
    });

    expect(router).toBeDefined();
    expect(handlers).toHaveLength(1);
  });
});

