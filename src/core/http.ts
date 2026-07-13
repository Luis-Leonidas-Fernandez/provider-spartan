import { ZodError, ZodSchema } from "zod";
import { AppError } from "./errors.js";

export function parseOrThrow<T>(schema: ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError("Invalid request data", 400, "validation_error");
    }
    throw error;
  }
}
