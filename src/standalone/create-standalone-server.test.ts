import { describe, expect, it, vi } from "vitest";
import { createTestDatabaseUrl } from "../test/helpers/test-db.js";

describe("createStandaloneServer", () => {
  it("registers the plugin correctly in standalone mode", async () => {
    vi.resetModules();
    process.env.APP_ENV = "test";
    process.env.LOG_LEVEL = "error";
    process.env.GATEWAY_HOST = "127.0.0.1";
    process.env.GATEWAY_PORT = "20128";
    process.env.DATABASE_URL = createTestDatabaseUrl();
    process.env.APP_API_KEY_PEPPER = "test-pepper";
    process.env.CREDENTIAL_ENCRYPTION_KEY = "test-encryption-secret";
    process.env.GEMINI_RUNTIME_SURFACE = "antigravity";
    process.env.ALLOW_INSECURE_CREDENTIAL_STORAGE = "false";

    const mod = await import("./create-standalone-server.js");
    const app = await mod.createStandaloneServer({ prefix: "/provider-gateway" });

    const response = await app.inject({ method: "GET", url: "/provider-gateway/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    await app.close();
  });
});
