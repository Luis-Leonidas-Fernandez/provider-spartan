import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providerHealthTable = sqliteTable("provider_health", {
  providerId: text("provider_id").primaryKey(),
  status: text("status").notNull(),
  lastCheckedAt: text("last_checked_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  latencyMs: integer("latency_ms"),
});
