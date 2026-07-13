import { eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { ProviderRepositoryPort } from "../application/ports/provider-repository.port.js";
import type { Provider, ProviderHealth } from "../domain/provider.types.js";
import { providerHealthTable } from "./provider-health.table.js";
import { providersTable } from "./provider.table.js";

export class DrizzleProviderRepository implements ProviderRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}
  async create(entity: Provider) { this.db.insert(providersTable).values(entity).run(); }
  async findAll() { return this.db.select().from(providersTable).all() as Provider[]; }
  async findById(id: string) { return (this.db.select().from(providersTable).where(eq(providersTable.id, id)).get() as Provider | undefined) ?? null; }
  async findDefault() { return (this.db.select().from(providersTable).where(eq(providersTable.isDefault, true)).get() as Provider | undefined) ?? null; }
  async clearDefault() { this.db.update(providersTable).set({ isDefault: false }).where(eq(providersTable.isDefault, true)).run(); }
  async update(entity: Provider) { this.db.update(providersTable).set(entity).where(eq(providersTable.id, entity.id)).run(); }
  async delete(id: string) { this.db.delete(providersTable).where(eq(providersTable.id, id)).run(); }
  async getHealth(providerId: string) { return (this.db.select().from(providerHealthTable).where(eq(providerHealthTable.providerId, providerId)).get() as ProviderHealth | undefined) ?? null; }
  async upsertHealth(health: ProviderHealth) { this.db.insert(providerHealthTable).values(health).onConflictDoUpdate({ target: providerHealthTable.providerId, set: health }).run(); }
}
