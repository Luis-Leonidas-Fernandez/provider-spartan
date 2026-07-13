import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../core/errors.js";
import { createProviderGatewayModule, type ProviderGatewayModule } from "../core/create-provider-gateway-module.js";
import type { ProviderGatewayModuleOptions } from "../core/provider-gateway-options.js";
import { registerProviderGatewayRoutes } from "./register-provider-gateway-routes.js";

export type ProviderGatewayPluginOptions =
  | ({ module: ProviderGatewayModule } & Partial<ProviderGatewayModuleOptions>)
  | ({ module?: undefined } & ProviderGatewayModuleOptions);

function normalizeRoutePrefix(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/$/, "") : withLeadingSlash;
}

function resolveProviderAuthRoutePrefix(options: Partial<ProviderGatewayModuleOptions> & { prefix?: string }) {
  const explicit = normalizeRoutePrefix(options.providerAuthPrefix);
  if (explicit) return explicit;

  const mountedPrefix = normalizeRoutePrefix(options.prefix);
  return mountedPrefix && mountedPrefix !== "/" ? `${mountedPrefix}/auth` : "/auth";
}

export const providerGatewayPlugin: FastifyPluginAsync<ProviderGatewayPluginOptions> = async (app, options) => {
  const module = options.module ?? createProviderGatewayModule({
    ...(options.appEnv !== undefined ? { appEnv: options.appEnv } : {}),
    ...(options.logLevel !== undefined ? { logLevel: options.logLevel } : {}),
    ...(options.databaseUrl !== undefined ? { databaseUrl: options.databaseUrl } : {}),
    ...(options.sqlite !== undefined ? { sqlite: options.sqlite } : {}),
    ...(options.database !== undefined ? { database: options.database } : {}),
    appApiKeyPepper: options.appApiKeyPepper,
    ...(options.credentialEncryptionKey !== undefined ? { credentialEncryptionKey: options.credentialEncryptionKey } : {}),
    ...(options.allowInsecureCredentialStorage !== undefined ? { allowInsecureCredentialStorage: options.allowInsecureCredentialStorage } : {}),
    ...(options.publicBaseUrl !== undefined ? { publicBaseUrl: options.publicBaseUrl } : {}),
    ...(options.providerAuthCallbackMode !== undefined ? { providerAuthCallbackMode: options.providerAuthCallbackMode } : {}),
    ...(options.providerAuthPublicBaseUrl !== undefined ? { providerAuthPublicBaseUrl: options.providerAuthPublicBaseUrl } : {}),
    ...(options.providerAuthPrefix !== undefined ? { providerAuthPrefix: options.providerAuthPrefix } : {}),
    ...(options.providerAuthRefreshSkewMs !== undefined ? { providerAuthRefreshSkewMs: options.providerAuthRefreshSkewMs } : {}),
    ...(options.providerAuthLifecycleAuditDir !== undefined ? { providerAuthLifecycleAuditDir: options.providerAuthLifecycleAuditDir } : {}),
    ...(options.codexClientId !== undefined ? { codexClientId: options.codexClientId } : {}),
    ...(options.codexOAuthAuditDir !== undefined ? { codexOAuthAuditDir: options.codexOAuthAuditDir } : {}),
    ...(options.codexRequestAuditDir !== undefined ? { codexRequestAuditDir: options.codexRequestAuditDir } : {}),
    ...(options.codexAccountDiscoveryDir !== undefined ? { codexAccountDiscoveryDir: options.codexAccountDiscoveryDir } : {}),
    ...(options.geminiRequestAuditDir !== undefined ? { geminiRequestAuditDir: options.geminiRequestAuditDir } : {}),
    ...(options.geminiRuntimeSurface !== undefined ? { geminiRuntimeSurface: options.geminiRuntimeSurface } : {}),
    ...(options.antigravityCliBin !== undefined ? { antigravityCliBin: options.antigravityCliBin } : {}),
    ...(options.antigravityCliTimeoutMs !== undefined ? { antigravityCliTimeoutMs: options.antigravityCliTimeoutMs } : {}),
    ...(options.antigravityCliMaxConcurrentProcesses !== undefined ? { antigravityCliMaxConcurrentProcesses: options.antigravityCliMaxConcurrentProcesses } : {}),
    ...(options.antigravityCliMaxQueuedProcesses !== undefined ? { antigravityCliMaxQueuedProcesses: options.antigravityCliMaxQueuedProcesses } : {}),
    ...(options.antigravityCliRunner !== undefined ? { antigravityCliRunner: options.antigravityCliRunner } : {}),
    ...(options.antigravityCliLocator !== undefined ? { antigravityCliLocator: options.antigravityCliLocator } : {}),
    ...(options.antigravityAuthProcessLauncher !== undefined ? { antigravityAuthProcessLauncher: options.antigravityAuthProcessLauncher } : {}),
    ...(options.localCliMaxConcurrentProcesses !== undefined ? { localCliMaxConcurrentProcesses: options.localCliMaxConcurrentProcesses } : {}),
    ...(options.localCliMaxQueuedProcesses !== undefined ? { localCliMaxQueuedProcesses: options.localCliMaxQueuedProcesses } : {}),
    ...(options.antigravityAuthFlowTimeoutMs !== undefined ? { antigravityAuthFlowTimeoutMs: options.antigravityAuthFlowTimeoutMs } : {}),
    ...(options.antigravityAuthFlowTtlMs !== undefined ? { antigravityAuthFlowTtlMs: options.antigravityAuthFlowTtlMs } : {}),
    ...(options.claudeRequestAuditDir !== undefined ? { claudeRequestAuditDir: options.claudeRequestAuditDir } : {}),
    ...(options.claudeRuntimeSurface !== undefined ? { claudeRuntimeSurface: options.claudeRuntimeSurface } : {}),
    ...(options.claudeCliBin !== undefined ? { claudeCliBin: options.claudeCliBin } : {}),
    ...(options.claudeCliTimeoutMs !== undefined ? { claudeCliTimeoutMs: options.claudeCliTimeoutMs } : {}),
    ...(options.claudeCliMaxConcurrentProcesses !== undefined ? { claudeCliMaxConcurrentProcesses: options.claudeCliMaxConcurrentProcesses } : {}),
    ...(options.claudeCliMaxQueuedProcesses !== undefined ? { claudeCliMaxQueuedProcesses: options.claudeCliMaxQueuedProcesses } : {}),
    ...(options.claudeCliRunner !== undefined ? { claudeCliRunner: options.claudeCliRunner } : {}),
    ...(options.claudeCliLocator !== undefined ? { claudeCliLocator: options.claudeCliLocator } : {}),
    ...(options.claudeCliStatusService !== undefined ? { claudeCliStatusService: options.claudeCliStatusService } : {}),
    ...(options.claudeAuthProcessLauncher !== undefined ? { claudeAuthProcessLauncher: options.claudeAuthProcessLauncher } : {}),
    ...(options.claudeAuthFlowTimeoutMs !== undefined ? { claudeAuthFlowTimeoutMs: options.claudeAuthFlowTimeoutMs } : {}),
    ...(options.claudeAuthFlowTtlMs !== undefined ? { claudeAuthFlowTtlMs: options.claudeAuthFlowTtlMs } : {}),
    ...(options.cursorCliPath !== undefined ? { cursorCliPath: options.cursorCliPath } : {}),
    ...(options.cursorCliTimeoutMs !== undefined ? { cursorCliTimeoutMs: options.cursorCliTimeoutMs } : {}),
    ...(options.cursorCliLocator !== undefined ? { cursorCliLocator: options.cursorCliLocator } : {}),
    ...(options.cursorCliRunner !== undefined ? { cursorCliRunner: options.cursorCliRunner } : {}),
    ...(options.cursorCliStatusService !== undefined ? { cursorCliStatusService: options.cursorCliStatusService } : {}),
    ...(options.cursorAuthProcessLauncher !== undefined ? { cursorAuthProcessLauncher: options.cursorAuthProcessLauncher } : {}),
    ...(options.cursorAuthFlowTimeoutMs !== undefined ? { cursorAuthFlowTimeoutMs: options.cursorAuthFlowTimeoutMs } : {}),
    ...(options.cursorAuthFlowTtlMs !== undefined ? { cursorAuthFlowTtlMs: options.cursorAuthFlowTtlMs } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.runMigrations !== undefined ? { runMigrations: options.runMigrations } : {}),
  });
  app.decorate("providerGatewayModule", module);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    module.logger.error("Unhandled error", { message });
    return reply.code(500).send({ error: "internal_error", message: "Unexpected error" });
  });

  const providerAuthPublicBaseUrl = options.providerAuthPublicBaseUrl ?? options.publicBaseUrl;
  await registerProviderGatewayRoutes(app, module, {
    ...(providerAuthPublicBaseUrl !== undefined ? { providerAuthPublicBaseUrl } : {}),
    providerAuthRoutePrefix: resolveProviderAuthRoutePrefix(options),
  });
  app.addHook("onClose", async () => {
    if ("shutdown" in module && typeof module.shutdown === "function") {
      await module.shutdown();
    }
  });
};
