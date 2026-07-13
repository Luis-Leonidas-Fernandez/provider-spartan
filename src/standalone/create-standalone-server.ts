import Fastify from "fastify";
import { getConfig } from "../core/config.js";
import { createProviderGatewayModule, type ProviderGatewayModule } from "../core/create-provider-gateway-module.js";
import { providerGatewayPlugin } from "../fastify/provider-gateway.plugin.js";

export async function createStandaloneServer(options?: {
  module?: ProviderGatewayModule;
  prefix?: string;
}) {
  const config = getConfig();
  const app = Fastify({ logger: false });
  const module = options?.module ?? createProviderGatewayModule({
    appEnv: config.appEnv,
    logLevel: config.logLevel,
    databaseUrl: config.databaseUrl,
    appApiKeyPepper: config.appApiKeyPepper,
    credentialEncryptionKey: config.credentialEncryptionKey,
    publicBaseUrl: config.publicBaseUrl,
    providerAuthPublicBaseUrl: config.publicBaseUrl,
    providerAuthRefreshSkewMs: config.providerAuthRefreshSkewMs,
    providerAuthLifecycleAuditDir: config.providerAuthLifecycleAuditDir,
    codexOAuthAuditDir: config.codexOAuthAuditDir,
    codexRequestAuditDir: config.codexRequestAuditDir,
    codexAccountDiscoveryDir: config.codexAccountDiscoveryDir,
    geminiRequestAuditDir: config.geminiRequestAuditDir,
    cursorRequestAuditDir: config.cursorRequestAuditDir,
    geminiRuntimeSurface: config.geminiRuntimeSurface,
    antigravityCliBin: config.antigravityCliBin,
    antigravityCliTimeoutMs: config.antigravityCliTimeoutMs,
    claudeRequestAuditDir: config.claudeRequestAuditDir,
    claudeRuntimeSurface: config.claudeRuntimeSurface,
    claudeCliBin: config.claudeCliBin,
    claudeCliTimeoutMs: config.claudeCliTimeoutMs,
    cursorCliPath: config.cursorCliPath,
    cursorCliTimeoutMs: config.cursorCliTimeoutMs,
    cursorCliMaxConcurrentProcesses: config.cursorCliMaxConcurrentProcesses,
    cursorCliMaxQueuedProcesses: config.cursorCliMaxQueuedProcesses,
    allowInsecureCredentialStorage: config.allowInsecureCredentialStorage,
  });

  app.decorate("providerGatewayModule", module);

  await app.register(providerGatewayPlugin, {
    ...(options?.prefix !== undefined ? { prefix: options.prefix } : {}),
    module,
    appApiKeyPepper: config.appApiKeyPepper,
  });

  return app;
}
