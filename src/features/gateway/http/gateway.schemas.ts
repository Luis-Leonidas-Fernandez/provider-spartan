import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const gatewayChatCompletionSchema = z.object({
  model: nonEmptyString,
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: nonEmptyString,
    name: z.string().optional(),
  })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
});
