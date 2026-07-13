import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1);
export const optionalNullableString = z.string().trim().optional().nullable();
