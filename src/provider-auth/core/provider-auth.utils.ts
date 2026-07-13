import { NotFoundError } from "../../core/errors.js";
import type { ProviderRepositoryPort } from "../../features/provider/application/ports/provider-repository.port.js";
import type { Provider } from "../../features/provider/domain/provider.types.js";
import { createProvider, createProviderHealth } from "../../features/provider/domain/provider.entity.js";
import type { ProviderAuthStrategyRegistry } from "./provider-auth-strategy-registry.js";
import type {
  ProviderConnection,
  ProviderConnectionStatus,
  ProviderConnectionStatusReason,
  ProviderCredentialMetadata,
  StartProviderAuthInput,
} from "./provider-auth.types.js";

export const DEFAULT_PROVIDER_AUTH_REFRESH_BEFORE_EXPIRES_MS = 5 * 60 * 1000;

export function computeExpiresAt(expiresIn: number | null) {
  if (!expiresIn || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export function parseMetadata(value: string | null | undefined): ProviderCredentialMetadata | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ProviderCredentialMetadata
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseScopes(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function isConnectionExpired(connection: Pick<ProviderConnection, "tokenExpiresAt">) {
  return Boolean(connection.tokenExpiresAt && Date.parse(connection.tokenExpiresAt) <= Date.now());
}

export function shouldRefreshConnection(
  connection: Pick<ProviderConnection, "tokenExpiresAt" | "encryptedRefreshToken">,
  refreshBeforeExpiresMs = DEFAULT_PROVIDER_AUTH_REFRESH_BEFORE_EXPIRES_MS,
) {
  return Boolean(
    connection.tokenExpiresAt
    && connection.encryptedRefreshToken
    && Date.parse(connection.tokenExpiresAt) - Date.now() <= refreshBeforeExpiresMs,
  );
}

export function shouldReconnectForStatus(status: ProviderConnectionStatus) {
  return status === "expired" || status === "refresh_failed" || status === "revoked" || status === "error";
}

export function getConnectionStatusReason(status: ProviderConnectionStatus | null | undefined): ProviderConnectionStatusReason {
  if (!status || status === "connected" || status === "pending") return null;
  if (status === "expired") return "expired";
  if (status === "refresh_failed") return "refresh_failed";
  if (status === "revoked") return "revoked";
  if (status === "disabled") return "disabled";
  return "error";
}

export function getConnectionStatusMessage(status: ProviderConnectionStatus) {
  switch (status) {
    case "connected":
      return "Connection active";
    case "pending":
      return "Waiting for auth callback";
    case "expired":
      return "Connection expired. Reconnect required.";
    case "refresh_failed":
      return "Automatic refresh failed. Reconnect required.";
    case "revoked":
      return "Connection was revoked by the provider.";
    case "disabled":
      return "Connection disabled.";
    case "error":
      return "Connection in error state.";
    default:
      return "Connection status unknown";
  }
}

export function getStatusMessageForConnectionState(connection: Pick<ProviderConnection, "status"> | null) {
  if (!connection) return "Provider is not connected";
  return getConnectionStatusMessage(connection.status);
}

function matchesDefaultProvider(provider: Provider, seed: Omit<Provider, "id" | "createdAt" | "updatedAt">) {
  return provider.providerType === seed.providerType
    && provider.accessMode === seed.accessMode
    && provider.isEnabled === seed.isEnabled;
}

function createStrategySeed(strategy: {
  getDefaultProviderSeed?: () => Omit<Provider, "id" | "createdAt" | "updatedAt">;
}) {
  return strategy.getDefaultProviderSeed?.() ?? null;
}

export async function resolveProviderRecord(
  providerRepository: ProviderRepositoryPort,
  strategyRegistry: ProviderAuthStrategyRegistry,
  input: Pick<StartProviderAuthInput, "provider" | "providerId">,
) {
  const strategy = strategyRegistry.get(input.provider);

  if (input.providerId) {
    const provider = await providerRepository.findById(input.providerId);
    if (!provider) throw new NotFoundError("Provider not found");
    if (strategy.matchesProviderRecord && !strategy.matchesProviderRecord(provider)) {
      throw new NotFoundError(`Provider ${input.providerId} is not compatible with ${input.provider}`);
    }
    return { provider, strategy };
  }

  const seed = createStrategySeed(strategy);
  if (!seed) throw new NotFoundError(`Provider ${input.provider} requires providerId`);

  const providers = await providerRepository.findAll();
  const existing = providers.find((provider) => strategy.matchesProviderRecord
    ? strategy.matchesProviderRecord(provider)
    : matchesDefaultProvider(provider, seed));
  if (existing) return { provider: existing, strategy };

  const entity = createProvider(seed);
  await providerRepository.create(entity);
  await providerRepository.upsertHealth(createProviderHealth(entity.id));
  return { provider: entity, strategy };
}
