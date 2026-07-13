import type { ProviderOAuthSession } from "../../domain/credential.types.js";

export interface ProviderOAuthSessionRepositoryPort {
  create(entity: ProviderOAuthSession): Promise<void>;
  findByState(state: string): Promise<ProviderOAuthSession | null>;
  deleteByState(state: string): Promise<void>;
  deleteByProviderId(providerId: string): Promise<void>;
  deleteExpired(nowIso: string): Promise<void>;
}
