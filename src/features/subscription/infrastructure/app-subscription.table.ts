import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appSubscriptionsTable = sqliteTable("app_subscriptions", {
  id: text("id").primaryKey(),
  appClientId: text("app_client_id").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
