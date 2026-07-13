import type { ProviderCredential } from "../domain/credential.types.js";

export function presentProviderCredential(entity: ProviderCredential | null) {
  if (!entity) return { loginStatus: "unknown", credential: null };
  const { encryptedValue, encryptedRefreshToken, encryptedIdToken, ...safe } = entity;
  void encryptedValue;
  void encryptedRefreshToken;
  void encryptedIdToken;
  return safe;
}
