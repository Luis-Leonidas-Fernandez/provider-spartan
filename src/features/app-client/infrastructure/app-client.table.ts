import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const appClientsTable = sqliteTable("app_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  apiKeyHash: text("api_key_hash").notNull(),
  apiKeyPrefix: text("api_key_prefix").notNull().unique(),
  apiKeyLastFour: text("api_key_last_four").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
