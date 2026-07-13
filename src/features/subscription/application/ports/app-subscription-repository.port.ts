import type { AppSubscription } from "../../domain/subscription.types.js";

export interface AppSubscriptionRepositoryPort {
  create(entity: AppSubscription): Promise<void>;
  findAll(): Promise<AppSubscription[]>;
  findById(id: string): Promise<AppSubscription | null>;
  findByAppClientId(appClientId: string): Promise<AppSubscription[]>;
  update(entity: AppSubscription): Promise<void>;
  delete(id: string): Promise<void>;
}
