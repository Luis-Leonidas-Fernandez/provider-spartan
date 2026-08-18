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


export const gatewayImageGenerationSchema = z.object({
  model: nonEmptyString,
  prompt: nonEmptyString,
  n: z.number().int().positive().max(10).optional().default(1),
  size: z.string().trim().regex(/^(auto|[1-9]\d{1,4}x[1-9]\d{1,4})$/, "size must be auto or use WIDTHxHEIGHT format").optional().default("1024x1024"),
  quality: z.string().trim().min(1).optional(),
  response_format: z.enum(["url", "b64_json"]).optional().default("b64_json"),
});
