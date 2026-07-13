import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providersTable = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull(),
  accessMode: text("access_mode").notNull(),
  baseUrl: text("base_url"),
  defaultModel: text("default_model"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  supportsUsageReporting: integer("supports_usage_reporting", { mode: "boolean" }).notNull().default(false),
  supportsStreaming: integer("supports_streaming", { mode: "boolean" }).notNull().default(false),
  pricingJson: text("pricing_json"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
