import { z } from "zod";

export const claudeImportTokenBodySchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
});

export const claudeAuthFlowParamsSchema = z.object({
  flowId: z.string().min(1),
});

export const claudeAuthFlowInputBodySchema = z.object({
  value: z.string().min(1),
});

export const claudeTestMessageBodySchema = z.object({
  message: z.string().min(1),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
