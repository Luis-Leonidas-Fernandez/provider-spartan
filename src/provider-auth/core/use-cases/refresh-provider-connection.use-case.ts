import { nowIso } from "../../../shared/date/date.js";
import type { ProviderRepositoryPort } from "../../../features/provider/application/ports/provider-repository.port.js";
import type { ProviderConnectionStorePort } from "../ports/provider-connection-store.port.js";
import type { ProviderAuthCipherPort } from "../ports/credential-cipher.port.js";
import type { LegacyProviderCredentialSyncPort } from "../ports/legacy-provider-credential-sync.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "../ports/provider-connection-lifecycle-audit.port.js";
import type { ProviderAuthStrategyRegistry } from "../provider-auth-strategy-registry.js";
import type { ProviderConnection } from "../provider-auth.types.js";
import { ProviderConnectionNotFoundError, ProviderConnectionRefreshFailedError, ProviderConnectionRevokedError } from "../provider-auth.errors.js";
import { computeExpiresAt, parseMetadata, parseScopes } from "../provider-auth.utils.js";

export class RefreshProviderConnectionUseCase {
  constructor(
    private readonly strategyRegistry: ProviderAuthStrategyRegistry,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly credentialCipher: ProviderAuthCipherPort,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
    private readonly legacyCredentialSync?: LegacyProviderCredentialSyncPort,
  ) {}

  async execute(connectionId: string) {
    const connection = await this.connectionStore.findById(connectionId);
    if (!connection) throw new ProviderConnectionNotFoundError(connectionId);

    const strategy = this.strategyRegistry.get(connection.providerType);
    if (!connection.encryptedRefreshToken || !strategy.refreshToken) return connection;

    const refreshToken = this.credentialCipher.decrypt(connection.encryptedRefreshToken);
    let tokens;
    try {
      tokens = await strategy.refreshToken({ refreshToken, connection });
    } catch (error) {
      const revoked = error instanceof ProviderConnectionRevokedError;
      const failed: ProviderConnection = {
        ...connection,
        status: revoked ? "revoked" : "refresh_failed",
        lastAuthCheckAt: nowIso(),
        updatedAt: nowIso(),
      };
      await this.connectionStore.update(failed);
      await this.lifecycleAuditRecorder?.record({
        provider: connection.providerType,
        providerId: connection.providerId,
        connectionId: connection.id,
        event: revoked ? "connection_revoked" : "connection_refresh_failed",
        occurredAt: failed.updatedAt,
        previousStatus: connection.status,
        nextStatus: failed.status,
        data: {
          error: error instanceof Error ? error.message : "Unknown refresh error",
        },
      });
      throw revoked ? error : new ProviderConnectionRefreshFailedError(connection.id, error);
    }
    const access = this.credentialCipher.encrypt(tokens.accessToken);
    const effectiveRefreshToken = tokens.refreshToken ?? refreshToken;
    const effectiveIdToken = tokens.idToken
      ?? (connection.encryptedIdToken ? this.credentialCipher.decrypt(connection.encryptedIdToken) : null);
    const previousMetadata = parseMetadata(connection.metadataJson);
    const metadata = strategy.buildConnectionMetadata
      ? await strategy.buildConnectionMetadata({
        tokens: {
          ...tokens,
          ...(effectiveRefreshToken !== undefined ? { refreshToken: effectiveRefreshToken } : {}),
          ...(effectiveIdToken !== undefined ? { idToken: effectiveIdToken } : {}),
        },
        ...(previousMetadata ? { previousMetadata } : {}),
        previousConnection: connection,
      })
      : (previousMetadata ?? {});
    const scopes = tokens.scopes ?? parseScopes(connection.scopesJson) ?? strategy.getDefaultScopes?.() ?? [];

    const next: ProviderConnection = {
      ...connection,
      encryptedAccessToken: access.encryptedValue,
      encryptedRefreshToken: effectiveRefreshToken
        ? this.credentialCipher.encrypt(effectiveRefreshToken).encryptedValue
        : connection.encryptedRefreshToken,
      encryptedIdToken: effectiveIdToken
        ? this.credentialCipher.encrypt(effectiveIdToken).encryptedValue
        : connection.encryptedIdToken,
      scopesJson: scopes.length ? JSON.stringify(scopes) : null,
      metadataJson: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
      tokenExpiresAt: computeExpiresAt(tokens.expiresIn) ?? connection.tokenExpiresAt,
      status: "connected",
      lastRefreshAt: nowIso(),
      lastAuthCheckAt: nowIso(),
      updatedAt: nowIso(),
    };

    await this.connectionStore.update(next);
    await this.lifecycleAuditRecorder?.record({
      provider: connection.providerType,
      providerId: connection.providerId,
      connectionId: connection.id,
      event: "connection_refreshed",
      occurredAt: next.updatedAt,
      previousStatus: connection.status,
      nextStatus: next.status,
      data: {},
    });

    if (this.legacyCredentialSync) {
      const providerRecord = await this.providerRepository.findById(connection.providerId);
      if (providerRecord) {
        await this.legacyCredentialSync.syncAuthenticatedConnection({
          provider: connection.providerType,
          providerRecord,
          connection: next,
          tokens: {
            ...tokens,
            ...(effectiveRefreshToken !== undefined ? { refreshToken: effectiveRefreshToken } : {}),
            ...(effectiveIdToken !== undefined ? { idToken: effectiveIdToken } : {}),
          },
        });
      }
    }

    return next;
  }
}
