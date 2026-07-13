import { and, eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../core/database.js";
import type { ProviderConnectionStorePort } from "../core/ports/provider-connection-store.port.js";
import type { ProviderConnection } from "../core/provider-auth.types.js";
import { providerConnectionsTable } from "./provider-connection.table.js";

export class DrizzleProviderConnectionRepository implements ProviderConnectionStorePort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}

  async create(entity: ProviderConnection) {
    this.db.insert(providerConnectionsTable).values(entity).run();
  }

  async update(entity: ProviderConnection) {
    this.db.insert(providerConnectionsTable).values(entity).onConflictDoUpdate({
      target: providerConnectionsTable.id,
      set: entity,
    }).run();
  }

  async findById(id: string) {
    return (this.db.select().from(providerConnectionsTable).where(eq(providerConnectionsTable.id, id)).get() as ProviderConnection | undefined) ?? null;
  }

  async findDefaultByProviderId(providerId: string) {
    return (this.db.select().from(providerConnectionsTable).where(and(
      eq(providerConnectionsTable.providerId, providerId),
      eq(providerConnectionsTable.isDefault, true),
    )).get() as ProviderConnection | undefined) ?? null;
  }

  async clearDefaultsForProviderId(providerId: string) {
    this.db.update(providerConnectionsTable).set({ isDefault: false }).where(eq(providerConnectionsTable.providerId, providerId)).run();
  }

  async deleteById(id: string) {
    this.db.delete(providerConnectionsTable).where(eq(providerConnectionsTable.id, id)).run();
  }
}

