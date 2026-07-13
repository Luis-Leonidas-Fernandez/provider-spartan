import type { ProviderGatewayModuleOptions } from "./provider-gateway-options.js";
import {
  composeAppClientFeature,
  composeCodexFeature,
  composeGeminiFeature,
  composeClaudeFeature,
  composeCursorFeature,
  composeCredentialFeature,
  composeGatewayFeature,
  composeProviderFeature,
  composeSubscriptionFeature,
  composeUsageFeature,
  createCompositionContext,
} from "./composition/index.js";
import { ProviderAuthStrategyRegistry } from "../provider-auth/core/provider-auth-strategy-registry.js";
import { createProviderAuthModule } from "../provider-auth/core/provider-auth.module.js";
import { CodexLegacyCredentialSyncAdapter } from "../provider-auth/providers/codex/codex-legacy-credential-sync.adapter.js";
import { CodexAuthStrategy } from "../provider-auth/providers/codex/codex-auth-strategy.js";
import { GeminiAuthStrategy } from "../provider-auth/providers/gemini/gemini-auth-strategy.js";

export type ProviderGatewayModule = ReturnType<typeof createProviderGatewayModule>;

export function createProviderGatewayModule(options: ProviderGatewayModuleOptions) {
  const context = createCompositionContext(options);
  const appClient = composeAppClientFeature(context);
  const subscription = composeSubscriptionFeature(context);
  const credential = composeCredentialFeature(context);
  const provider = composeProviderFeature(context, { ensureFresh: credential.ensureFresh });
  const usage = composeUsageFeature(context);
  const providerAuthStrategyRegistry = new ProviderAuthStrategyRegistry();
  providerAuthStrategyRegistry.register(new CodexAuthStrategy(context.codexOAuthClient, context.codexClientId));
  providerAuthStrategyRegistry.register(new GeminiAuthStrategy(context.geminiOAuthClient));
  const providerAuth = createProviderAuthModule({
    strategyRegistry: providerAuthStrategyRegistry,
    providerRepository: context.providerRepository,
    connectionStore: context.providerConnectionRepository,
    stateStore: context.oauthStateRepository,
    credentialCipher: context.credentialCipher,
    refreshBeforeExpiresMs: context.providerAuthRefreshSkewMs,
    lifecycleAuditRecorder: context.providerConnectionLifecycleAuditRecorder,
    legacyCredentialSync: new CodexLegacyCredentialSyncAdapter(
      context.credentialRepository,
      context.credentialCipher,
    ),
  });
  const gateway = composeGatewayFeature(context, {
    validateKey: appClient.validateKey,
    ensureFresh: credential.ensureFresh,
    getDefaultProviderConnectionByProviderId: providerAuth.getDefaultProviderConnectionByProviderId,
    getDefaultProviderAuthStatus: providerAuth.getDefaultProviderAuthStatus,
    getValidProviderCredential: providerAuth.getValidProviderCredential,
  });
  const codex = composeCodexFeature(context, {
    getDefaultProviderAuthStatus: providerAuth.getDefaultProviderAuthStatus,
    getValidProviderCredential: providerAuth.getValidProviderCredential,
  });
  const gemini = composeGeminiFeature(context, {
    getDefaultProviderAuthStatus: providerAuth.getDefaultProviderAuthStatus,
    getValidProviderCredential: providerAuth.getValidProviderCredential,
  });
  const claude = composeClaudeFeature(context, {
    getValidProviderCredential: providerAuth.getValidProviderCredential,
  });
  const cursor = composeCursorFeature(context);

  const module = {
    logger: context.logger,
    database: context.database,
    appClient,
    subscription,
    provider,
    credential,
    providerAuth,
    codex,
    gemini,
    claude,
    cursor,
    gateway,
    usage,
    async handleChatCompletion(input: Parameters<typeof gateway.handleChatCompletion.execute>[0]) {
      return module.gateway.handleChatCompletion.execute(input);
    },
    async getUsageOverview() {
      return module.usage.overview.execute();
    },
    async createProvider(input: Parameters<typeof provider.create.execute>[0]) {
      return module.provider.create.execute(input);
    },
    async storeProviderCredential(input: Parameters<typeof credential.store.execute>[0]) {
      return module.credential.store.execute(input);
    },
    async shutdown() {
      context.claudeAuthFlowManager.cancelAll("Provider gateway shutdown");
      context.claudeCliProcessSupervisor.cancelAll("Provider gateway shutdown");
      context.antigravityAuthFlowManager.cancelAll("Provider gateway shutdown");
      context.cursorAuthFlowManager.cancelAll("Provider gateway shutdown");
      context.cursorCliProcessSupervisor.cancelAll("Provider gateway shutdown");
      context.localCliProcessSupervisor.cancelAll("Provider gateway shutdown");
    },
  };

  return module;
}
