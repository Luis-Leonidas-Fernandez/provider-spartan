import { eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { UsageEventRepositoryPort } from "../application/ports/usage-event-repository.port.js";
import type { UsageEvent } from "../domain/usage.types.js";
import { usageEventsTable } from "./usage-event.table.js";

export class DrizzleUsageEventRepository implements UsageEventRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}

  async create(event: UsageEvent) {
    this.db.insert(usageEventsTable).values(event).run();
  }

  async findAll() {
    return this.db.select().from(usageEventsTable).all() as UsageEvent[];
  }

  async findByProviderId(providerId: string) {
    return this.db.select().from(usageEventsTable).where(eq(usageEventsTable.providerId, providerId)).all() as UsageEvent[];
  }

  async findByAppClientId(appClientId: string) {
    return this.db.select().from(usageEventsTable).where(eq(usageEventsTable.appClientId, appClientId)).all() as UsageEvent[];
  }
}
