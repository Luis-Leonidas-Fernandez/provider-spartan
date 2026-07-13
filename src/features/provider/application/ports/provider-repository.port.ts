import type { Provider, ProviderHealth } from "../../domain/provider.types.js";

export interface ProviderRepositoryPort {
  create(entity: Provider): Promise<void>;
  findAll(): Promise<Provider[]>;
  findById(id: string): Promise<Provider | null>;
  findDefault(): Promise<Provider | null>;
  clearDefault(): Promise<void>;
  update(entity: Provider): Promise<void>;
  delete(id: string): Promise<void>;
  getHealth(providerId: string): Promise<ProviderHealth | null>;
  upsertHealth(health: ProviderHealth): Promise<void>;
}
