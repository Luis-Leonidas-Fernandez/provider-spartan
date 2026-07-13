import { vi } from "vitest";
import { createTestDatabaseUrl } from "./test-db.js";

export async function createTestApp() {
  vi.resetModules();
  process.env.APP_ENV = "test";
  process.env.LOG_LEVEL = "error";
  process.env.GATEWAY_HOST = "127.0.0.1";
  process.env.GATEWAY_PORT = "20128";
  process.env.DATABASE_URL = createTestDatabaseUrl();
  process.env.APP_API_KEY_PEPPER = "test-pepper";
  process.env.CREDENTIAL_ENCRYPTION_KEY = "test-encryption-secret";
  process.env.PROVIDER_GATEWAY_PUBLIC_URL = "http://127.0.0.1:20128";
  process.env.PROVIDER_AUTH_REFRESH_SKEW_MS = "300000";
  process.env.PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR = "";
  process.env.CODEX_OAUTH_AUDIT_DIR = "";
  process.env.CODEX_REQUEST_AUDIT_DIR = process.env.CODEX_REQUEST_AUDIT_DIR || "";
  process.env.CODEX_ACCOUNT_DISCOVERY_DIR = process.env.CODEX_ACCOUNT_DISCOVERY_DIR || "";
  process.env.GEMINI_REQUEST_AUDIT_DIR = process.env.GEMINI_REQUEST_AUDIT_DIR || "";
  process.env.GEMINI_RUNTIME_SURFACE = "antigravity";
  process.env.CLAUDE_REQUEST_AUDIT_DIR = process.env.CLAUDE_REQUEST_AUDIT_DIR || "";
  process.env.CLAUDE_RUNTIME_SURFACE = process.env.CLAUDE_RUNTIME_SURFACE || "claude_code_cli";
  process.env.CLAUDE_CLI_BIN = process.env.CLAUDE_CLI_BIN || "claude";
  process.env.CLAUDE_CLI_TIMEOUT_MS = process.env.CLAUDE_CLI_TIMEOUT_MS || "60000";
  process.env.ALLOW_INSECURE_CREDENTIAL_STORAGE = "false";
  const mod = await import("../../bootstrap/create-app.js");
  return mod.createApp();
}
