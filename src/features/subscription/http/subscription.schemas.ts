import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const idParamsSchema = z.object({ id: nonEmptyString });
export const subscriptionPlanBodySchema = z.object({
  name: nonEmptyString,
  monthlyRequestLimit: z.number().nonnegative(),
  monthlyTokenLimit: z.number().nonnegative(),
  monthlyBudgetUsd: z.number().nonnegative(),
  allowedProvidersJson: z.string(),
  allowedModelsJson: z.string(),
  isActive: z.boolean().default(true),
});
export const subscriptionPlanUpdateBodySchema = subscriptionPlanBodySchema.partial().refine((data) => Object.keys(data).length > 0);
export const appSubscriptionBodySchema = z.object({
  appClientId: nonEmptyString,
  planId: nonEmptyString,
  status: z.enum(["active", "inactive", "expired", "cancelled"]),
  startsAt: nonEmptyString,
  endsAt: nonEmptyString.optional().nullable(),
});
export const appSubscriptionUpdateBodySchema = appSubscriptionBodySchema.partial().refine((data)=>Object.keys(data).length>0);
