import type { ProviderConnectionStorePort } from "../ports/provider-connection-store.port.js";
import type { ProviderRepositoryPort } from "../../../features/provider/application/ports/provider-repository.port.js";
import type { ProviderAuthStrategyRegistry } from "../provider-auth-strategy-registry.js";
import { nowIso } from "../../../shared/date/date.js";
import { ProviderConnectionNotFoundError } from "../provider-auth.errors.js";
import { isConnectionExpired, resolveProviderRecord } from "../provider-auth.utils.js";

async function normalizeConnectionStatus(connectionStore: ProviderConnectionStorePort, connection: Awaited<ReturnType<ProviderConnectionStorePort["findById"]>>) {
  if (!connection) return null;
  if (connection.status === "connected" && isConnectionExpired(connection) && !connection.encryptedRefreshToken) {
    const expired = {
      ...connection,
      status: "expired" as const,
      lastAuthCheckAt: nowIso(),
      updatedAt: nowIso(),
    };
    await connectionStore.update(expired);
    return expired;
  }
  return connection;
}

export class GetProviderAuthStatusUseCase {
  constructor(private readonly connectionStore: ProviderConnectionStorePort) {}

  async execute(connectionId: string) {
    const connection = await normalizeConnectionStatus(this.connectionStore, await this.connectionStore.findById(connectionId));
    if (!connection) throw new ProviderConnectionNotFoundError(connectionId);
    return connection;
  }
}

export class GetDefaultProviderConnectionByProviderIdUseCase {
  constructor(private readonly connectionStore: ProviderConnectionStorePort) {}

  async execute(providerId: string) {
    return normalizeConnectionStatus(this.connectionStore, await this.connectionStore.findDefaultByProviderId(providerId));
  }
}

export class GetDefaultProviderAuthStatusUseCase {
  constructor(
    private readonly strategyRegistry: ProviderAuthStrategyRegistry,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
  ) {}

  async execute(input: { provider: string; providerId?: string }) {
    const { provider } = await resolveProviderRecord(this.providerRepository, this.strategyRegistry, input);
    return normalizeConnectionStatus(this.connectionStore, await this.connectionStore.findDefaultByProviderId(provider.id));
  }
}
