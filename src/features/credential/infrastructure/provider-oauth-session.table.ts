import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providerOauthSessionsTable = sqliteTable("provider_oauth_sessions", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  providerType: text("provider_type").notNull().default("codex"),
  state: text("state").notNull().unique(),
  codeVerifier: text("code_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
