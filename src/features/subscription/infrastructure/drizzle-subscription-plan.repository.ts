import { eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { SubscriptionPlanRepositoryPort } from "../application/ports/subscription-plan-repository.port.js";
import type { SubscriptionPlan } from "../domain/subscription.types.js";
import { subscriptionPlansTable } from "./subscription-plan.table.js";

export class DrizzleSubscriptionPlanRepository implements SubscriptionPlanRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}
  async create(entity: SubscriptionPlan) { this.db.insert(subscriptionPlansTable).values(entity).run(); }
  async findAll() { return this.db.select().from(subscriptionPlansTable).all() as SubscriptionPlan[]; }
  async findById(id: string) { return (this.db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id)).get() as SubscriptionPlan | undefined) ?? null; }
  async update(entity: SubscriptionPlan) { this.db.update(subscriptionPlansTable).set(entity).where(eq(subscriptionPlansTable.id, entity.id)).run(); }
  async delete(id: string) { this.db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id)).run(); }
}
