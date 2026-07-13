import { eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { AppSubscriptionRepositoryPort } from "../application/ports/app-subscription-repository.port.js";
import type { AppSubscription } from "../domain/subscription.types.js";
import { appSubscriptionsTable } from "./app-subscription.table.js";

export class DrizzleAppSubscriptionRepository implements AppSubscriptionRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}
  async create(entity: AppSubscription) { this.db.insert(appSubscriptionsTable).values(entity).run(); }
  async findAll() { return this.db.select().from(appSubscriptionsTable).all() as AppSubscription[]; }
  async findById(id: string) { return (this.db.select().from(appSubscriptionsTable).where(eq(appSubscriptionsTable.id, id)).get() as AppSubscription | undefined) ?? null; }
  async findByAppClientId(appClientId: string) { return this.db.select().from(appSubscriptionsTable).where(eq(appSubscriptionsTable.appClientId, appClientId)).all() as AppSubscription[]; }
  async update(entity: AppSubscription) { this.db.update(appSubscriptionsTable).set(entity).where(eq(appSubscriptionsTable.id, entity.id)).run(); }
  async delete(id: string) { this.db.delete(appSubscriptionsTable).where(eq(appSubscriptionsTable.id, id)).run(); }
}
