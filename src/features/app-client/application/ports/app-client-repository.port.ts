import type { AppClient } from "../../domain/app-client.types.js";

export interface AppClientRepositoryPort {
  create(entity: AppClient): Promise<void>;
  findAll(): Promise<AppClient[]>;
  findById(id: string): Promise<AppClient | null>;
  findByApiKeyPrefix(prefix: string): Promise<AppClient | null>;
  update(entity: AppClient): Promise<void>;
  touchLastUsedAt(id: string, lastUsedAt: string): Promise<void>;
  delete(id: string): Promise<void>;
}
