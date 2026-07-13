import { createId } from "../../../shared/id/id.js";
import { nowIso } from "../../../shared/date/date.js";
import { NotFoundError } from "../../../core/errors.js";
import type { ProviderRepositoryPort } from "../../../features/provider/application/ports/provider-repository.port.js";
import type { ProviderConnectionStorePort } from "../ports/provider-connection-store.port.js";
import type { OAuthStateStorePort } from "../ports/oauth-state-store.port.js";
import type { ProviderAuthCipherPort } from "../ports/credential-cipher.port.js";
import type { LegacyProviderCredentialSyncPort } from "../ports/legacy-provider-credential-sync.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "../ports/provider-connection-lifecycle-audit.port.js";
import type { ProviderAuthStrategyRegistry } from "../provider-auth-strategy-registry.js";
import type { CompleteProviderAuthInput, ProviderConnection } from "../provider-auth.types.js";
import { ProviderAuthStateExpiredError, ProviderAuthStateInvalidError } from "../provider-auth.errors.js";
import { computeExpiresAt, parseMetadata, parseScopes } from "../provider-auth.utils.js";

function sanitizeAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeAuditValue(item));
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token")
      || lowerKey.includes("secret")
      || lowerKey.includes("password")
      || lowerKey.includes("authorization")
      || lowerKey.includes("cookie")
    ) {
      continue;
    }
    result[key] = sanitizeAuditValue(raw);
  }
  return result;
}

export class CompleteProviderAuthUseCase {
  constructor(
    private readonly strategyRegistry: ProviderAuthStrategyRegistry,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly stateStore: OAuthStateStorePort,
    private readonly credentialCipher: ProviderAuthCipherPort,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
    private readonly legacyCredentialSync?: LegacyProviderCredentialSyncPort,
  ) {}

  async execute(input: CompleteProviderAuthInput) {
    const oauthState = await this.stateStore.findByState(input.state);
    if (!oauthState || oauthState.providerType !== input.provider) throw new ProviderAuthStateInvalidError();
    if (Date.parse(oauthState.expiresAt) < Date.now()) {
      await this.stateStore.deleteByState(input.state);
      throw new ProviderAuthStateExpiredError();
    }

    const providerRecord = await this.providerRepository.findById(oauthState.providerId);
    if (!providerRecord) throw new NotFoundError("Provider not found");

    const strategy = this.strategyRegistry.get(input.provider);
    const tokens = await strategy.exchangeCode({
      code: input.code,
      codeVerifier: oauthState.codeVerifier,
      redirectUri: oauthState.redirectUri,
    });

    const previous = await this.connectionStore.findDefaultByProviderId(providerRecord.id);
    await this.connectionStore.clearDefaultsForProviderId(providerRecord.id);

    const previousRefreshToken = previous?.encryptedRefreshToken
      ? this.credentialCipher.decrypt(previous.encryptedRefreshToken)
      : null;
    const previousIdToken = previous?.encryptedIdToken
      ? this.credentialCipher.decrypt(previous.encryptedIdToken)
      : null;

    const effectiveRefreshToken = tokens.refreshToken ?? previousRefreshToken;
    const effectiveIdToken = tokens.idToken ?? previousIdToken;
    const access = this.credentialCipher.encrypt(tokens.accessToken);
    const previousMetadata = parseMetadata(previous?.metadataJson);
    const metadata = strategy.buildConnectionMetadata
      ? await strategy.buildConnectionMetadata({
        tokens: {
          ...tokens,
          ...(effectiveRefreshToken !== undefined ? { refreshToken: effectiveRefreshToken } : {}),
          ...(effectiveIdToken !== undefined ? { idToken: effectiveIdToken } : {}),
        },
        ...(previousMetadata ? { previousMetadata } : {}),
        previousConnection: previous ?? null,
      })
      : (previousMetadata ?? {});
    const scopes = tokens.scopes ?? strategy.getDefaultScopes?.() ?? parseScopes(previous?.scopesJson);

    const connection: ProviderConnection = {
      id: previous?.id ?? createId(),
      providerId: providerRecord.id,
      providerType: input.provider,
      authType: "oauth_token",
      name: previous?.name ?? strategy.getDefaultConnectionName?.({ provider: providerRecord, previousConnection: previous }) ?? `${providerRecord.name} Connection`,
      status: "connected",
      isDefault: true,
      encryptedAccessToken: access.encryptedValue,
      encryptedRefreshToken: effectiveRefreshToken
        ? this.credentialCipher.encrypt(effectiveRefreshToken).encryptedValue
        : null,
      encryptedIdToken: effectiveIdToken
        ? this.credentialCipher.encrypt(effectiveIdToken).encryptedValue
        : null,
      scopesJson: scopes.length ? JSON.stringify(scopes) : null,
      metadataJson: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
      tokenExpiresAt: computeExpiresAt(tokens.expiresIn),
      lastRefreshAt: nowIso(),
      lastAuthCheckAt: nowIso(),
      createdAt: previous?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };

    if (previous) await this.connectionStore.update(connection);
    else await this.connectionStore.create(connection);
    await this.stateStore.deleteByState(input.state);
    await this.lifecycleAuditRecorder?.record({
      provider: input.provider,
      providerId: providerRecord.id,
      connectionId: connection.id,
      event: "connection_completed",
      occurredAt: connection.updatedAt,
      previousStatus: previous?.status ?? null,
      nextStatus: connection.status,
      data: {
        connectionResult: {
          authType: connection.authType,
          connectionName: connection.name,
          refreshTokenExists: Boolean(connection.encryptedRefreshToken),
          idTokenExists: Boolean(connection.encryptedIdToken),
          tokenExpiresAt: connection.tokenExpiresAt,
          scopes,
          metadata: sanitizeAuditValue(metadata),
        },
      },
    });

    const legacyCredential = this.legacyCredentialSync
      ? await this.legacyCredentialSync.syncAuthenticatedConnection({
        provider: input.provider,
        providerRecord,
        connection,
        tokens: {
          ...tokens,
          ...(effectiveRefreshToken !== undefined ? { refreshToken: effectiveRefreshToken } : {}),
          ...(effectiveIdToken !== undefined ? { idToken: effectiveIdToken } : {}),
        },
      })
      : null;

    return {
      connection,
      ...(legacyCredential ? { legacyCredential } : {}),
    };
  }
}
