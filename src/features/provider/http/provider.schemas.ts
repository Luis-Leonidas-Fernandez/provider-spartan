import { z } from "zod";
import { nonEmptyString, optionalNullableString } from "../../../shared/validation/common.js";

const pricingSchema = z.object({
  inputPricePerMillion: z.number().nonnegative(),
  cachedInputPricePerMillion: z.number().nonnegative().default(0),
  outputPricePerMillion: z.number().nonnegative(),
});

export const providerParamsSchema = z.object({ id: nonEmptyString });
export const providerBodySchema = z.object({
  name: nonEmptyString,
  providerType: z.enum(["openai", "minimax", "kimi", "gemini", "claude", "cursor", "local_qwen", "custom_openai_compatible", "codex_subscription", "other"]),
  accessMode: z.enum(["api_key", "token_plan", "oauth", "local", "manual", "custom"]),
  baseUrl: z.string().url().optional().nullable(),
  defaultModel: optionalNullableString,
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  supportsUsageReporting: z.boolean().default(false),
  supportsStreaming: z.boolean().default(false),
  pricing: pricingSchema.optional().nullable(),
  notes: optionalNullableString,
});
export const providerUpdateBodySchema = providerBodySchema.partial().refine((data) => Object.keys(data).length > 0);
