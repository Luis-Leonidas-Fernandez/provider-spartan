import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usageEventsTable = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  appClientId: text("app_client_id").notNull(),
  providerId: text("provider_id").notNull(),
  modelName: text("model_name").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cachedInputTokens: integer("cached_input_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  usageSource: text("usage_source").notNull(),
  estimatedCostUsd: real("estimated_cost_usd"),
  finalCostUsd: real("final_cost_usd"),
  pricingSnapshotJson: text("pricing_snapshot_json"),
  durationMs: integer("duration_ms").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});
