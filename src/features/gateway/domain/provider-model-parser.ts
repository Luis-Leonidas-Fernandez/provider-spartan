import { AppError } from "../../../core/errors.js";
import type { ParsedProviderModel } from "./gateway.types.js";

const KNOWN_PREFIXES = new Set(["openai", "minimax", "kimi", "local", "codex", "gemini", "antigravity", "claude", "cursor"]);

export function parseProviderModel(model: string): ParsedProviderModel {
  const value = model.trim();
  if (!value) throw new AppError("model is required", 400, "model_required");
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex === value.length - 1) {
    return { modelName: value };
  }
  const providerPrefix = value.slice(0, slashIndex).trim();
  const modelName = value.slice(slashIndex + 1).trim();
  if (!providerPrefix || !modelName) throw new AppError("Invalid model format", 400, "invalid_model_format");
  return KNOWN_PREFIXES.has(providerPrefix) ? { providerPrefix, modelName } : { modelName: value };
}
