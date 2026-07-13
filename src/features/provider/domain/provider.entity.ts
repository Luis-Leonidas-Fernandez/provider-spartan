import { AppError } from "../../../core/errors.js";
import { nowIso } from "../../../shared/date/date.js";
import { createId } from "../../../shared/id/id.js";
import type { Provider, ProviderHealth, ProviderPricing, ProviderType } from "./provider.types.js";

function requiresBaseUrl(type: ProviderType) {
  return type === "openai" || type === "custom_openai_compatible" || type === "other" || type === "minimax" || type === "kimi";
}

export function parsePricingJson(pricingJson: string | null): ProviderPricing | null {
  if (!pricingJson) return null;
  const parsed = JSON.parse(pricingJson) as Partial<ProviderPricing>;
  if (
    typeof parsed.inputPricePerMillion !== "number"
    || typeof parsed.cachedInputPricePerMillion !== "number"
    || typeof parsed.outputPricePerMillion !== "number"
  ) {
    throw new AppError("pricingJson must contain numeric pricing fields");
  }
  return {
    inputPricePerMillion: parsed.inputPricePerMillion,
    cachedInputPricePerMillion: parsed.cachedInputPricePerMillion,
    outputPricePerMillion: parsed.outputPricePerMillion,
  };
}

function validatePricing(pricingJson: string | null) {
  if (!pricingJson) return;
  const pricing = parsePricingJson(pricingJson);
  if (!pricing) return;
  if (pricing.inputPricePerMillion < 0 || pricing.cachedInputPricePerMillion < 0 || pricing.outputPricePerMillion < 0) {
    throw new AppError("Pricing values must be non-negative");
  }
}

export function createProvider(input: Omit<Provider, "id" | "createdAt" | "updatedAt">): Provider {
  if (!input.name.trim()) throw new AppError("Provider name is required");
  if (requiresBaseUrl(input.providerType) && !input.baseUrl) throw new AppError("baseUrl is required for this provider type");
  if (input.isDefault && !input.defaultModel) throw new AppError("defaultModel is required when provider is default");
  validatePricing(input.pricingJson);
  const timestamp = nowIso();
  return { ...input, id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function updateProvider(entity: Provider, input: Partial<Omit<Provider, "id" | "createdAt" | "updatedAt">>): Provider {
  const updated = { ...entity, ...input, updatedAt: nowIso() };
  if (requiresBaseUrl(updated.providerType) && !updated.baseUrl) throw new AppError("baseUrl is required for this provider type");
  if (updated.isDefault && !updated.defaultModel) throw new AppError("defaultModel is required when provider is default");
  validatePricing(updated.pricingJson);
  return updated;
}

export function createProviderHealth(providerId: string): ProviderHealth {
  return { providerId, status: "unknown", lastCheckedAt: null, lastSuccessAt: null, lastError: null, latencyMs: null };
}
