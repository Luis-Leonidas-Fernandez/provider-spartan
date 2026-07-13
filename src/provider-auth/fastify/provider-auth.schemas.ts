import { z } from "zod";
import { nonEmptyString } from "../../shared/validation/common.js";

export const providerAuthParamsSchema = z.object({
  provider: nonEmptyString,
});

export const providerAuthCallbackQuerySchema = z.object({
  state: nonEmptyString,
  code: nonEmptyString,
});

export const providerAuthStatusQuerySchema = z.object({
  providerId: nonEmptyString.optional(),
});
