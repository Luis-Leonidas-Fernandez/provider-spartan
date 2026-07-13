import { eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { AppClientRepositoryPort } from "../application/ports/app-client-repository.port.js";
import type { AppClient } from "../domain/app-client.types.js";
import { appClientsTable } from "./app-client.table.js";

export class DrizzleAppClientRepository implements AppClientRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}

  async create(entity: AppClient) {
    this.db.insert(appClientsTable).values(entity).run();
  }

  async findAll() {
    return this.db.select().from(appClientsTable).all() as AppClient[];
  }

  async findById(id: string) {
    return (this.db.select().from(appClientsTable).where(eq(appClientsTable.id, id)).get() as AppClient | undefined) ?? null;
  }

  async findByApiKeyPrefix(prefix: string) {
    return (this.db.select().from(appClientsTable).where(eq(appClientsTable.apiKeyPrefix, prefix)).get() as AppClient | undefined) ?? null;
  }

  async update(entity: AppClient) {
    this.db.update(appClientsTable).set(entity).where(eq(appClientsTable.id, entity.id)).run();
  }

  async touchLastUsedAt(id: string, lastUsedAt: string) {
    this.db.update(appClientsTable).set({ lastUsedAt, updatedAt: lastUsedAt }).where(eq(appClientsTable.id, id)).run();
  }

  async delete(id: string) {
    this.db.delete(appClientsTable).where(eq(appClientsTable.id, id)).run();
  }
}
