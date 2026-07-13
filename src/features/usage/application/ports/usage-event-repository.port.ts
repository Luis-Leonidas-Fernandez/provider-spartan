import type { UsageEvent } from "../../domain/usage.types.js";

export interface UsageEventRepositoryPort {
  create(event: UsageEvent): Promise<void>;
  findAll(): Promise<UsageEvent[]>;
  findByProviderId(providerId: string): Promise<UsageEvent[]>;
  findByAppClientId(appClientId: string): Promise<UsageEvent[]>;
}
