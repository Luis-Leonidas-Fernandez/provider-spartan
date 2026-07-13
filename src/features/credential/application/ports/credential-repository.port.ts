import type { ProviderCredential } from "../../domain/credential.types.js";

export interface CredentialRepositoryPort {
  upsert(entity: ProviderCredential): Promise<void>;
  findByProviderId(providerId: string): Promise<ProviderCredential | null>;
  deleteByProviderId(providerId: string): Promise<void>;
}
