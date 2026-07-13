import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const requestLogsTable = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  appClientId: text("app_client_id").notNull(),
  providerId: text("provider_id").notNull(),
  modelName: text("model_name").notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  durationMs: integer("duration_ms").notNull(),
  requestMetadataJson: text("request_metadata_json").notNull(),
  responseMetadataJson: text("response_metadata_json").notNull(),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});
