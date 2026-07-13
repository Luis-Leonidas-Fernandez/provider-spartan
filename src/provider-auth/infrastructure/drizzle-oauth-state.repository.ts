import { eq, lt } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../core/database.js";
import type { OAuthStateStorePort } from "../core/ports/oauth-state-store.port.js";
import type { OAuthState } from "../core/provider-auth.types.js";
import { providerOauthSessionsTable } from "../../features/credential/infrastructure/provider-oauth-session.table.js";

export class DrizzleOAuthStateRepository implements OAuthStateStorePort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}

  async create(entity: OAuthState) {
    this.db.insert(providerOauthSessionsTable).values({
      id: entity.id,
      providerId: entity.providerId,
      providerType: entity.providerType,
      state: entity.state,
      codeVerifier: entity.codeVerifier,
      redirectUri: entity.redirectUri,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
    }).run();
  }

  async findByState(state: string) {
    return (this.db.select().from(providerOauthSessionsTable).where(eq(providerOauthSessionsTable.state, state)).get() as OAuthState | undefined) ?? null;
  }

  async deleteByState(state: string) {
    this.db.delete(providerOauthSessionsTable).where(eq(providerOauthSessionsTable.state, state)).run();
  }

  async deleteExpired(nowIso: string) {
    this.db.delete(providerOauthSessionsTable).where(lt(providerOauthSessionsTable.expiresAt, nowIso)).run();
  }

  async deleteByProviderId(providerId: string) {
    this.db.delete(providerOauthSessionsTable).where(eq(providerOauthSessionsTable.providerId, providerId)).run();
  }
}
