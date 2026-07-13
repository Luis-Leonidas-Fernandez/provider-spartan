import { eq, lt } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { ProviderOAuthSessionRepositoryPort } from "../application/ports/provider-oauth-session-repository.port.js";
import type { ProviderOAuthSession } from "../domain/credential.types.js";
import { providerOauthSessionsTable } from "./provider-oauth-session.table.js";

export class DrizzleProviderOAuthSessionRepository implements ProviderOAuthSessionRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}

  async create(entity: ProviderOAuthSession) {
    this.db.insert(providerOauthSessionsTable).values(entity).run();
  }

  async findByState(state: string) {
    return (this.db.select().from(providerOauthSessionsTable).where(eq(providerOauthSessionsTable.state, state)).get() as ProviderOAuthSession | undefined) ?? null;
  }

  async deleteByState(state: string) {
    this.db.delete(providerOauthSessionsTable).where(eq(providerOauthSessionsTable.state, state)).run();
  }

  async deleteByProviderId(providerId: string) {
    this.db.delete(providerOauthSessionsTable).where(eq(providerOauthSessionsTable.providerId, providerId)).run();
  }

  async deleteExpired(nowIso: string) {
    this.db.delete(providerOauthSessionsTable).where(lt(providerOauthSessionsTable.expiresAt, nowIso)).run();
  }
}
