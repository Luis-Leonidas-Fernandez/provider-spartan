import { nowIso } from "../../../../shared/date/date.js";
import { createId } from "../../../../shared/id/id.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { ProviderConnectionStorePort } from "../../../../provider-auth/core/ports/provider-connection-store.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "../../../../provider-auth/core/ports/provider-connection-lifecycle-audit.port.js";
import type { ProviderConnection, ProviderCredentialMetadata } from "../../../../provider-auth/core/provider-auth.types.js";
import type { ClaudeRuntimeSurface } from "../../../../shared/provider-runtime/claude-runtime.js";
import { parseMetadata } from "../../../../provider-auth/core/provider-auth.utils.js";
import { ensureDefaultClaudeProvider } from "./claude-local-provider-record.js";

export class ClaudeLocalAuthConnectionSyncService {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
  ) {}

  async syncAuthenticatedSession() {
    const provider = await ensureDefaultClaudeProvider(this.providerRepository);
    const previousConnection = await this.connectionStore.findDefaultByProviderId(provider.id);
    const occurredAt = nowIso();
    const metadata: ProviderCredentialMetadata = {
      ...(parseMetadata(previousConnection?.metadataJson) ?? {}),
      provider: "claude",
      authMethod: "claude-subscription-local-cli",
      runtimeSurface: this.runtimeSurface,
      complianceStatus: "local_cli_session",
      runtimeStatus: "untested",
      localCliAuthenticated: true,
      lastRuntimeError: null,
    };

    const nextConnection: ProviderConnection = previousConnection
      ? {
          ...previousConnection,
          name: previousConnection.name || "Claude Local Session",
          status: "connected",
          isDefault: true,
          authType: "custom",
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          encryptedIdToken: null,
          tokenExpiresAt: null,
          lastRefreshAt: null,
          lastAuthCheckAt: occurredAt,
          metadataJson: JSON.stringify(metadata),
          updatedAt: occurredAt,
        }
      : {
          id: createId(),
          providerId: provider.id,
          providerType: "claude",
          authType: "custom",
          name: "Claude Local Session",
          status: "connected",
          isDefault: true,
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          encryptedIdToken: null,
          scopesJson: null,
          metadataJson: JSON.stringify(metadata),
          tokenExpiresAt: null,
          lastRefreshAt: null,
          lastAuthCheckAt: occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };

    if (previousConnection) await this.connectionStore.update(nextConnection);
    else {
      await this.connectionStore.clearDefaultsForProviderId(provider.id);
      await this.connectionStore.create(nextConnection);
    }

    await this.lifecycleAuditRecorder?.record({
      provider: "claude",
      providerId: provider.id,
      connectionId: nextConnection.id,
      event: "connection_completed",
      occurredAt,
      previousStatus: previousConnection?.status ?? null,
      nextStatus: nextConnection.status,
      data: {
        authMethod: "claude-subscription-local-cli",
        runtimeSurface: this.runtimeSurface,
      },
    });

    return nextConnection;
  }
}
