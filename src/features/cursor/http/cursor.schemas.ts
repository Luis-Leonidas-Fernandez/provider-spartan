import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const cursorAuthFlowParamsSchema = z.object({
  flowId: nonEmptyString,
});

export const cursorAuthFlowInputBodySchema = z.object({
  value: nonEmptyString,
});

export const cursorTestMessageBodySchema = z.object({
  message: nonEmptyString,
  model: z.string().trim().min(1).optional(),
  system: z.string().trim().min(1).optional(),
  max_tokens: z.coerce.number().int().positive().max(8192).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
});
