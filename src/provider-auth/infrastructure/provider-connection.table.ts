import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providerConnectionsTable = sqliteTable("provider_connections", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  providerType: text("provider_type").notNull(),
  authType: text("auth_type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  encryptedIdToken: text("encrypted_id_token"),
  scopesJson: text("scopes_json"),
  metadataJson: text("metadata_json"),
  tokenExpiresAt: text("token_expires_at"),
  lastRefreshAt: text("last_refresh_at"),
  lastAuthCheckAt: text("last_auth_check_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

