import { integer, sqliteTable, text, real } from "drizzle-orm/sqlite-core";

export const subscriptionPlansTable = sqliteTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  monthlyRequestLimit: integer("monthly_request_limit").notNull(),
  monthlyTokenLimit: integer("monthly_token_limit").notNull(),
  monthlyBudgetUsd: real("monthly_budget_usd").notNull(),
  allowedProvidersJson: text("allowed_providers_json").notNull(),
  allowedModelsJson: text("allowed_models_json").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
