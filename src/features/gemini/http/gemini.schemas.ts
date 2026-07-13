import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const geminiTestMessageBodySchema = z.object({
  message: nonEmptyString,
  model: z.string().optional().nullable(),
  system: z.string().optional().nullable(),
  max_tokens: z.number().int().positive().optional().nullable(),
  temperature: z.number().min(0).max(2).optional().nullable(),
});

export const geminiAuthFlowParamsSchema = z.object({
  flowId: nonEmptyString,
});

export const geminiAuthFlowInputBodySchema = z.object({
  value: nonEmptyString,
});
