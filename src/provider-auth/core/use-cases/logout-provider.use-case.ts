import type { ProviderRepositoryPort } from "../../../features/provider/application/ports/provider-repository.port.js";
import type { ProviderConnectionStorePort } from "../ports/provider-connection-store.port.js";
import type { OAuthStateStorePort } from "../ports/oauth-state-store.port.js";
import type { LegacyProviderCredentialSyncPort } from "../ports/legacy-provider-credential-sync.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "../ports/provider-connection-lifecycle-audit.port.js";
import type { ProviderAuthStrategyRegistry } from "../provider-auth-strategy-registry.js";
import { ProviderConnectionNotFoundError } from "../provider-auth.errors.js";
import { resolveProviderRecord } from "../provider-auth.utils.js";

export class LogoutProviderUseCase {
  constructor(
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly stateStore: OAuthStateStorePort,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
    private readonly legacyCredentialSync?: LegacyProviderCredentialSyncPort,
  ) {}

  async execute(connectionId: string) {
    const connection = await this.connectionStore.findById(connectionId);
    if (!connection) throw new ProviderConnectionNotFoundError(connectionId);

    await this.connectionStore.deleteById(connection.id);
    await this.stateStore.deleteByProviderId(connection.providerId);
    if (this.legacyCredentialSync) {
      await this.legacyCredentialSync.deleteByProviderId(connection.providerId);
    }
    await this.lifecycleAuditRecorder?.record({
      provider: connection.providerType,
      providerId: connection.providerId,
      connectionId: connection.id,
      event: "connection_logged_out",
      occurredAt: connection.updatedAt,
      previousStatus: connection.status,
      nextStatus: null,
      data: {},
    });

    return { connectionId, providerId: connection.providerId, loggedOut: true };
  }
}

export class LogoutDefaultProviderUseCase {
  constructor(
    private readonly strategyRegistry: ProviderAuthStrategyRegistry,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly stateStore: OAuthStateStorePort,
    private readonly logoutProvider: LogoutProviderUseCase,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
    private readonly legacyCredentialSync?: LegacyProviderCredentialSyncPort,
  ) {}

  async execute(input: { provider: string; providerId?: string }) {
    const { provider } = await resolveProviderRecord(this.providerRepository, this.strategyRegistry, input);
    const connection = await this.connectionStore.findDefaultByProviderId(provider.id);
    if (!connection) {
      await this.stateStore.deleteByProviderId(provider.id);
      if (this.legacyCredentialSync) {
        await this.legacyCredentialSync.deleteByProviderId(provider.id);
      }
      return { connectionId: null, providerId: provider.id, loggedOut: true };
    }
    return this.logoutProvider.execute(connection.id);
  }
}
