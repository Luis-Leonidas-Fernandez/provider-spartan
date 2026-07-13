import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providerCredentialsTable = sqliteTable("provider_credentials", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().unique(),
  credentialType: text("credential_type").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  encryptedIdToken: text("encrypted_id_token"),
  maskedValue: text("masked_value").notNull(),
  metadataJson: text("metadata_json"),
  tokenExpiresAt: text("token_expires_at"),
  lastRefreshAt: text("last_refresh_at"),
  refreshTokenExists: integer("refresh_token_exists", { mode: "boolean" }).notNull().default(false),
  loginStatus: text("login_status").notNull(),
  lastAuthCheckAt: text("last_auth_check_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
