import { z } from "zod";
import { nonEmptyString, optionalNullableString } from "../../../shared/validation/common.js";

export const createAppClientBodySchema = z.object({
  name: nonEmptyString,
  description: optionalNullableString,
});

export const updateAppClientBodySchema = z.object({
  name: nonEmptyString.optional(),
  description: optionalNullableString,
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const appClientParamsSchema = z.object({
  id: nonEmptyString,
});
