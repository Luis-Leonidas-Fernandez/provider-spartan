import type { ProviderCredential } from "../../domain/credential.types.js";

const DEFAULT_REFRESH_LEAD_MS = 60_000;
const CODEX_MAX_REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000;

function parseTimeMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getCredentialExpiryMs(credential: ProviderCredential | null | undefined) {
  return parseTimeMs(credential?.tokenExpiresAt);
}

export function getCredentialLastRefreshMs(credential: ProviderCredential | null | undefined) {
  return parseTimeMs(credential?.lastRefreshAt);
}

export function shouldRefreshCredential(
  providerType: string,
  credential: ProviderCredential | null | undefined,
  nowMs = Date.now(),
  leadMs = DEFAULT_REFRESH_LEAD_MS,
) {
  if (!credential?.encryptedRefreshToken) return false;

  const expiresAtMs = getCredentialExpiryMs(credential);
  if (expiresAtMs !== null && expiresAtMs - nowMs <= leadMs) {
    return true;
  }

  if (providerType === "codex_subscription") {
    const lastRefreshMs = getCredentialLastRefreshMs(credential);
    return !lastRefreshMs || nowMs - lastRefreshMs >= CODEX_MAX_REFRESH_AGE_MS;
  }

  return false;
}

export function isCredentialExpired(credential: ProviderCredential | null | undefined, nowMs = Date.now()) {
  const expiresAtMs = getCredentialExpiryMs(credential);
  return expiresAtMs !== null && expiresAtMs <= nowMs;
}
