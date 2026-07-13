import type { SubscriptionPlan } from "../../domain/subscription.types.js";

export interface SubscriptionPlanRepositoryPort {
  create(entity: SubscriptionPlan): Promise<void>;
  findAll(): Promise<SubscriptionPlan[]>;
  findById(id: string): Promise<SubscriptionPlan | null>;
  update(entity: SubscriptionPlan): Promise<void>;
  delete(id: string): Promise<void>;
}
