import type { ProviderRepositoryPort } from "../../features/provider/application/ports/provider-repository.port.js";
import type { ProviderConnectionStorePort } from "./ports/provider-connection-store.port.js";
import type { OAuthStateStorePort } from "./ports/oauth-state-store.port.js";
import type { ProviderAuthCipherPort } from "./ports/credential-cipher.port.js";
import type { LegacyProviderCredentialSyncPort } from "./ports/legacy-provider-credential-sync.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "./ports/provider-connection-lifecycle-audit.port.js";
import { ProviderAuthStrategyRegistry } from "./provider-auth-strategy-registry.js";
import { CompleteProviderAuthUseCase } from "./use-cases/complete-provider-auth.use-case.js";
import {
  GetDefaultProviderAuthStatusUseCase,
  GetDefaultProviderConnectionByProviderIdUseCase,
  GetProviderAuthStatusUseCase,
} from "./use-cases/get-provider-auth-status.use-case.js";
import { GetValidProviderCredentialUseCase } from "./use-cases/get-valid-provider-credential.use-case.js";
import { LogoutDefaultProviderUseCase, LogoutProviderUseCase } from "./use-cases/logout-provider.use-case.js";
import { RefreshProviderConnectionUseCase } from "./use-cases/refresh-provider-connection.use-case.js";
import { StartProviderAuthUseCase } from "./use-cases/start-provider-auth.use-case.js";

export function createProviderAuthModule(options: {
  strategyRegistry: ProviderAuthStrategyRegistry;
  providerRepository: ProviderRepositoryPort;
  connectionStore: ProviderConnectionStorePort;
  stateStore: OAuthStateStorePort;
  credentialCipher: ProviderAuthCipherPort;
  refreshBeforeExpiresMs?: number;
  lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort;
  legacyCredentialSync?: LegacyProviderCredentialSyncPort;
}) {
  const startProviderAuth = new StartProviderAuthUseCase(
    options.strategyRegistry,
    options.providerRepository,
    options.stateStore,
    options.lifecycleAuditRecorder,
  );
  const completeProviderAuth = new CompleteProviderAuthUseCase(
    options.strategyRegistry,
    options.providerRepository,
    options.connectionStore,
    options.stateStore,
    options.credentialCipher,
    options.lifecycleAuditRecorder,
    options.legacyCredentialSync,
  );
  const refreshProviderConnection = new RefreshProviderConnectionUseCase(
    options.strategyRegistry,
    options.providerRepository,
    options.connectionStore,
    options.credentialCipher,
    options.lifecycleAuditRecorder,
    options.legacyCredentialSync,
  );
  const getProviderAuthStatus = new GetProviderAuthStatusUseCase(options.connectionStore);
  const getDefaultProviderConnectionByProviderId = new GetDefaultProviderConnectionByProviderIdUseCase(options.connectionStore);
  const getDefaultProviderAuthStatus = new GetDefaultProviderAuthStatusUseCase(
    options.strategyRegistry,
    options.providerRepository,
    options.connectionStore,
  );
  const logoutProvider = new LogoutProviderUseCase(
    options.connectionStore,
    options.stateStore,
    options.lifecycleAuditRecorder,
    options.legacyCredentialSync,
  );
  const logoutDefaultProvider = new LogoutDefaultProviderUseCase(
    options.strategyRegistry,
    options.providerRepository,
    options.connectionStore,
    options.stateStore,
    logoutProvider,
    options.lifecycleAuditRecorder,
    options.legacyCredentialSync,
  );
  const getValidProviderCredential = new GetValidProviderCredentialUseCase(
    options.connectionStore,
    options.credentialCipher,
    refreshProviderConnection,
    options.refreshBeforeExpiresMs,
    options.lifecycleAuditRecorder,
  );

  return {
    async startProviderAuth(...args: Parameters<StartProviderAuthUseCase["execute"]>) {
      return startProviderAuth.execute(...args);
    },
    async completeProviderAuth(...args: Parameters<CompleteProviderAuthUseCase["execute"]>) {
      return completeProviderAuth.execute(...args);
    },
    async refreshProviderConnection(...args: Parameters<RefreshProviderConnectionUseCase["execute"]>) {
      return refreshProviderConnection.execute(...args);
    },
    async getProviderAuthStatus(...args: Parameters<GetProviderAuthStatusUseCase["execute"]>) {
      return getProviderAuthStatus.execute(...args);
    },
    async getDefaultProviderConnectionByProviderId(...args: Parameters<GetDefaultProviderConnectionByProviderIdUseCase["execute"]>) {
      return getDefaultProviderConnectionByProviderId.execute(...args);
    },
    async getDefaultProviderAuthStatus(...args: Parameters<GetDefaultProviderAuthStatusUseCase["execute"]>) {
      return getDefaultProviderAuthStatus.execute(...args);
    },
    async logoutProvider(...args: Parameters<LogoutProviderUseCase["execute"]>) {
      return logoutProvider.execute(...args);
    },
    async logoutDefaultProvider(...args: Parameters<LogoutDefaultProviderUseCase["execute"]>) {
      return logoutDefaultProvider.execute(...args);
    },
    async getValidProviderCredential(...args: Parameters<GetValidProviderCredentialUseCase["execute"]>) {
      return getValidProviderCredential.execute(...args);
    },
  };
}

export type ProviderAuthModule = ReturnType<typeof createProviderAuthModule>;
