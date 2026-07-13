import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const codexTestMessageBodySchema = z.object({
  message: nonEmptyString,
  model: z.string().optional().nullable(),
  system: z.string().optional().nullable(),
  max_tokens: z.number().int().positive().optional().nullable(),
});
