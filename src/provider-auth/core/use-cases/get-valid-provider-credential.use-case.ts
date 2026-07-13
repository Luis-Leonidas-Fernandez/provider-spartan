import type { ProviderConnectionStorePort } from "../ports/provider-connection-store.port.js";
import type { ProviderAuthCipherPort } from "../ports/credential-cipher.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "../ports/provider-connection-lifecycle-audit.port.js";
import { nowIso } from "../../../shared/date/date.js";
import type { ValidProviderCredential } from "../provider-auth.types.js";
import {
  ProviderConnectionExpiredError,
  ProviderConnectionNotFoundError,
  ProviderConnectionReconnectRequiredError,
  ProviderConnectionRevokedError,
} from "../provider-auth.errors.js";
import { getConnectionStatusReason, isConnectionExpired, parseMetadata, shouldRefreshConnection } from "../provider-auth.utils.js";
import { RefreshProviderConnectionUseCase } from "./refresh-provider-connection.use-case.js";

export class GetValidProviderCredentialUseCase {
  constructor(
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly credentialCipher: ProviderAuthCipherPort,
    private readonly refreshProviderConnection: RefreshProviderConnectionUseCase,
    private readonly refreshBeforeExpiresMs = 5 * 60 * 1000,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
  ) {}

  async execute(connectionId: string): Promise<ValidProviderCredential> {
    let connection = await this.connectionStore.findById(connectionId);
    if (!connection) {
      throw new ProviderConnectionNotFoundError(connectionId);
    }

    if (connection.status === "revoked") {
      throw new ProviderConnectionRevokedError(connection.id);
    }
    if (connection.status === "refresh_failed" || connection.status === "disabled" || connection.status === "error") {
      throw new ProviderConnectionReconnectRequiredError(
        connection.id,
        connection.status === "refresh_failed"
          ? "refresh_failed"
          : connection.status === "disabled"
            ? "disabled"
            : "error",
      );
    }

    if (isConnectionExpired(connection) && !connection.encryptedRefreshToken) {
      const expired = {
        ...connection,
        status: "expired" as const,
        lastAuthCheckAt: nowIso(),
        updatedAt: nowIso(),
      };
      await this.connectionStore.update(expired);
      await this.lifecycleAuditRecorder?.record({
        provider: connection.providerType,
        providerId: connection.providerId,
        connectionId: connection.id,
        event: "connection_expired",
        occurredAt: expired.updatedAt,
        previousStatus: connection.status,
        nextStatus: expired.status,
        data: {},
      });
      throw new ProviderConnectionExpiredError(connection.id);
    }

    if (shouldRefreshConnection(connection, this.refreshBeforeExpiresMs)) {
      connection = await this.refreshProviderConnection.execute(connection.id);
    }

    if (!connection.encryptedAccessToken) {
      throw new ProviderConnectionNotFoundError(connectionId);
    }

    const validCredential: ValidProviderCredential = {
      providerType: connection.providerType,
      connectionId: connection.id,
      accessToken: this.credentialCipher.decrypt(connection.encryptedAccessToken),
    };

    if (connection.tokenExpiresAt) {
      validCredential.expiresAt = connection.tokenExpiresAt;
    }

    const metadata = parseMetadata(connection.metadataJson);
    if (metadata) {
      validCredential.metadata = metadata;
    }

    return validCredential;
  }
}
