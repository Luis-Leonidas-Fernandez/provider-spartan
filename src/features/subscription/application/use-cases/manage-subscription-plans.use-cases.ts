import { NotFoundError } from "../../../../core/errors.js";
import { createSubscriptionPlan, updateSubscriptionPlan, createAppSubscription, updateAppSubscription } from "../../domain/subscription.entity.js";
import type { SubscriptionPlanRepositoryPort } from "../ports/subscription-plan-repository.port.js";
import type { AppSubscriptionRepositoryPort } from "../ports/app-subscription-repository.port.js";
import type { AppSubscription, SubscriptionPlan } from "../../domain/subscription.types.js";

export class CreateSubscriptionPlanUseCase {
  constructor(private readonly repository: SubscriptionPlanRepositoryPort) {}
  async execute(input: Omit<SubscriptionPlan, "id" | "createdAt" | "updatedAt">) {
    const entity = createSubscriptionPlan(input);
    await this.repository.create(entity);
    return entity;
  }
}
export class ListSubscriptionPlansUseCase { constructor(private readonly repository: SubscriptionPlanRepositoryPort) {} execute(){ return this.repository.findAll(); } }
export class UpdateSubscriptionPlanUseCase {
  constructor(private readonly repository: SubscriptionPlanRepositoryPort) {}
  async execute(id: string, input: Partial<Omit<SubscriptionPlan, "id" | "createdAt" | "updatedAt">>) {
    const entity = await this.repository.findById(id); if (!entity) throw new NotFoundError("Subscription plan not found");
    const updated = updateSubscriptionPlan(entity, input); await this.repository.update(updated); return updated;
  }
}
export class DeleteSubscriptionPlanUseCase { constructor(private readonly repository: SubscriptionPlanRepositoryPort) {} async execute(id: string){ const entity = await this.repository.findById(id); if(!entity) throw new NotFoundError("Subscription plan not found"); await this.repository.delete(id);} }
export class CreateAppSubscriptionUseCase {
  constructor(private readonly repository: AppSubscriptionRepositoryPort) {}
  async execute(input: Omit<AppSubscription, "id" | "createdAt" | "updatedAt">) { const entity = createAppSubscription(input); await this.repository.create(entity); return entity; }
}
export class ListAppSubscriptionsUseCase { constructor(private readonly repository: AppSubscriptionRepositoryPort) {} execute(){ return this.repository.findAll(); } }
export class UpdateAppSubscriptionUseCase {
  constructor(private readonly repository: AppSubscriptionRepositoryPort) {}
  async execute(id: string, input: Partial<Omit<AppSubscription, "id" | "createdAt" | "updatedAt">>) { const entity = await this.repository.findById(id); if(!entity) throw new NotFoundError("App subscription not found"); const updated = updateAppSubscription(entity, input); await this.repository.update(updated); return updated; }
}
export class DeleteAppSubscriptionUseCase { constructor(private readonly repository: AppSubscriptionRepositoryPort) {} async execute(id:string){ const entity=await this.repository.findById(id); if(!entity) throw new NotFoundError("App subscription not found"); await this.repository.delete(id);} }
