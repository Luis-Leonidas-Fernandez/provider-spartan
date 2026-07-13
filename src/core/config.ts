import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { DEFAULT_ANTIGRAVITY_CLI_BIN, DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS, resolveGeminiRuntimeSurface, type GeminiRuntimeSurface } from "../shared/provider-runtime/gemini-runtime.js";
import { DEFAULT_CLAUDE_CLI_BIN, DEFAULT_CLAUDE_CLI_TIMEOUT_MS, resolveClaudeRuntimeSurface, type ClaudeRuntimeSurface } from "../shared/provider-runtime/claude-runtime.js";

loadEnv();

const DEFAULT_CURSOR_CLI_TIMEOUT_MS = 5_000;

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  GATEWAY_HOST: z.string().min(1).default("127.0.0.1"),
  GATEWAY_PORT: z.coerce.number().int().positive().default(20128),
  DATABASE_URL: z.string().min(1).default("file:./provider_gateway.db"),
  APP_API_KEY_PEPPER: z.string().optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional().default(""),
  PROVIDER_GATEWAY_PUBLIC_URL: z.union([z.string().url(), z.literal("")]).default(""),
  PROVIDER_AUTH_REFRESH_SKEW_MS: z.coerce.number().int().nonnegative().default(300000),
  PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR: z.string().optional().default(".provider-gateway/provider-auth-lifecycle-audit"),
  CODEX_OAUTH_AUDIT_DIR: z.string().optional().default(".provider-gateway/codex-oauth-audit"),
  CODEX_REQUEST_AUDIT_DIR: z.string().optional().default(".provider-gateway/codex-request-audit"),
  CODEX_ACCOUNT_DISCOVERY_DIR: z.string().optional().default(".provider-gateway/codex-account-discovery"),
  GEMINI_REQUEST_AUDIT_DIR: z.string().optional().default(".provider-gateway/gemini-request-audit"),
  CURSOR_REQUEST_AUDIT_DIR: z.string().optional().default(".provider-gateway/cursor-request-audit"),
  GEMINI_RUNTIME_SURFACE: z.string().optional().default("antigravity"),
  ANTIGRAVITY_CLI_BIN: z.string().optional().default(DEFAULT_ANTIGRAVITY_CLI_BIN),
  ANTIGRAVITY_CLI_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS),
  CLAUDE_REQUEST_AUDIT_DIR: z.string().optional().default(".provider-gateway/claude-request-audit"),
  CLAUDE_RUNTIME_SURFACE: z.enum(["claude_code_cli"]).optional().default("claude_code_cli"),
  CLAUDE_CLI_BIN: z.string().optional().default(DEFAULT_CLAUDE_CLI_BIN),
  CLAUDE_CLI_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_CLAUDE_CLI_TIMEOUT_MS),
  CURSOR_CLI_PATH: z.string().optional().default(""),
  CURSOR_CLI_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_CURSOR_CLI_TIMEOUT_MS),
  CURSOR_CLI_MAX_CONCURRENT_PROCESSES: z.coerce.number().int().positive().default(1),
  CURSOR_CLI_MAX_QUEUED_PROCESSES: z.coerce.number().int().nonnegative().default(10),
  ALLOW_INSECURE_CREDENTIAL_STORAGE: z
    .string()
    .transform((value) => value === "true")
    .default("false"),
});

export type AppConfig = {
  appEnv: "development" | "test" | "production";
  logLevel: "debug" | "info" | "warn" | "error";
  gatewayHost: string;
  gatewayPort: number;
  databaseUrl: string;
  appApiKeyPepper: string;
  credentialEncryptionKey: string;
  publicBaseUrl: string;
  providerAuthRefreshSkewMs: number;
  providerAuthLifecycleAuditDir: string;
  codexOAuthAuditDir: string;
  codexRequestAuditDir: string;
  codexAccountDiscoveryDir: string;
  geminiRequestAuditDir: string;
  cursorRequestAuditDir: string;
  geminiRuntimeSurface: GeminiRuntimeSurface;
  antigravityCliBin: string;
  antigravityCliTimeoutMs: number;
  claudeRequestAuditDir: string;
  claudeRuntimeSurface: ClaudeRuntimeSurface;
  claudeCliBin: string;
  claudeCliTimeoutMs: number;
  cursorCliPath: string;
  cursorCliTimeoutMs: number;
  cursorCliMaxConcurrentProcesses: number;
  cursorCliMaxQueuedProcesses: number;
  allowInsecureCredentialStorage: boolean;
};

let cachedConfig: AppConfig | null = null;

function resolveAppApiKeyPepper(input: {
  appEnv: "development" | "test" | "production";
  value: string | undefined;
}) {
  const pepper = input.value?.trim();
  if (pepper) return pepper;
  if (input.appEnv === "production") {
    throw new Error("APP_API_KEY_PEPPER is required in production");
  }

  console.warn(
    "[provider-gateway] APP_API_KEY_PEPPER is missing; using an insecure development fallback. Set it in .env before exposing gateway auth features.",
  );
  return "dev-only-app-api-key-pepper";
}

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = envSchema.parse(process.env);
  cachedConfig = {
    appEnv: parsed.APP_ENV,
    logLevel: parsed.LOG_LEVEL,
    gatewayHost: parsed.GATEWAY_HOST,
    gatewayPort: parsed.GATEWAY_PORT,
    databaseUrl: parsed.DATABASE_URL,
    appApiKeyPepper: resolveAppApiKeyPepper({
      appEnv: parsed.APP_ENV,
      value: parsed.APP_API_KEY_PEPPER,
    }),
    credentialEncryptionKey: parsed.CREDENTIAL_ENCRYPTION_KEY,
    publicBaseUrl: parsed.PROVIDER_GATEWAY_PUBLIC_URL,
    providerAuthRefreshSkewMs: parsed.PROVIDER_AUTH_REFRESH_SKEW_MS,
    providerAuthLifecycleAuditDir: parsed.PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR,
    codexOAuthAuditDir: parsed.CODEX_OAUTH_AUDIT_DIR,
    codexRequestAuditDir: parsed.CODEX_REQUEST_AUDIT_DIR,
    codexAccountDiscoveryDir: parsed.CODEX_ACCOUNT_DISCOVERY_DIR,
    geminiRequestAuditDir: parsed.GEMINI_REQUEST_AUDIT_DIR,
    cursorRequestAuditDir: parsed.CURSOR_REQUEST_AUDIT_DIR,
    geminiRuntimeSurface: resolveGeminiRuntimeSurface(parsed.GEMINI_RUNTIME_SURFACE),
    antigravityCliBin: parsed.ANTIGRAVITY_CLI_BIN,
    antigravityCliTimeoutMs: parsed.ANTIGRAVITY_CLI_TIMEOUT_MS,
    claudeRequestAuditDir: parsed.CLAUDE_REQUEST_AUDIT_DIR,
    claudeRuntimeSurface: resolveClaudeRuntimeSurface(parsed.CLAUDE_RUNTIME_SURFACE),
    claudeCliBin: parsed.CLAUDE_CLI_BIN,
    claudeCliTimeoutMs: parsed.CLAUDE_CLI_TIMEOUT_MS,
    cursorCliPath: parsed.CURSOR_CLI_PATH,
    cursorCliTimeoutMs: parsed.CURSOR_CLI_TIMEOUT_MS,
    cursorCliMaxConcurrentProcesses: parsed.CURSOR_CLI_MAX_CONCURRENT_PROCESSES,
    cursorCliMaxQueuedProcesses: parsed.CURSOR_CLI_MAX_QUEUED_PROCESSES,
    allowInsecureCredentialStorage: parsed.ALLOW_INSECURE_CREDENTIAL_STORAGE,
  };

  return cachedConfig;
}
