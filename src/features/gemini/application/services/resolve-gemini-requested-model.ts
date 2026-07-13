import type { GeminiAvailableModel } from "../ports/gemini-model-catalog.port.js";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function scoreGeminiCandidate(model: GeminiAvailableModel) {
  if (model.family !== "gemini") return -1;
  if (model.runtimeModel === "gemini-2.5-pro") return 450;
  if (model.runtimeModel === "gemini-2.5-flash") return 320;
  if (model.runtimeModel === "gemini-2.5-flash-lite") return 220;
  if (model.runtimeModel === "pro" && model.quality === "high") return 400;
  if (model.runtimeModel === "pro") return 350;
  if (model.runtimeModel === "flash" && model.quality === "medium") return 300;
  if (model.runtimeModel === "flash") return 250;
  if (model.runtimeModel === "flash_lite") return 200;
  return 100;
}

function findPreferredGeminiModel(
  models: GeminiAvailableModel[],
  runtimeModel: string,
) {
  return models
    .filter((model) => model.family === "gemini" && model.runtimeModel === runtimeModel)
    .sort((left, right) => scoreGeminiCandidate(right) - scoreGeminiCandidate(left))[0] ?? null;
}

function findPreferredAliasMatch(
  models: GeminiAvailableModel[],
  normalizedRequestedModel: string,
) {
  const matches = models.filter((model) =>
    (model.aliases ?? []).some((alias) => normalize(alias) === normalizedRequestedModel),
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  return [...matches].sort((left, right) => {
    if (left.family === "gemini" && right.family === "gemini") {
      return scoreGeminiCandidate(right) - scoreGeminiCandidate(left);
    }
    if (left.family === "gemini") return -1;
    if (right.family === "gemini") return 1;
    return left.label.localeCompare(right.label);
  })[0] ?? null;
}

export type ResolvedGeminiRequestedModel = {
  requestedModel: string | null;
  selectedLabel: string;
  runtimeModel: string;
  catalogModelKey: string;
  family: GeminiAvailableModel["family"];
  source: "catalog_label" | "catalog_alias" | "runtime_fallback";
};

export function resolveGeminiRequestedModel(input: {
  requestedModel?: string | null;
  availableModels: GeminiAvailableModel[];
  defaultRuntimeModel?: string | null;
}) {
  const requestedModel = input.requestedModel?.trim() || null;
  const normalizedRequestedModel = requestedModel ? normalize(requestedModel) : null;

  if (normalizedRequestedModel) {
    const exactLabel = input.availableModels.find((model) => normalize(model.label) === normalizedRequestedModel);
    if (exactLabel) {
      return {
        requestedModel,
        selectedLabel: exactLabel.label,
        runtimeModel: exactLabel.runtimeModel,
        catalogModelKey: exactLabel.catalogModelKey,
        family: exactLabel.family,
        source: "catalog_label" as const,
      };
    }

    const aliasMatch = findPreferredAliasMatch(input.availableModels, normalizedRequestedModel);
    if (aliasMatch) {
      return {
        requestedModel,
        selectedLabel: aliasMatch.label,
        runtimeModel: aliasMatch.runtimeModel,
        catalogModelKey: aliasMatch.catalogModelKey,
        family: aliasMatch.family,
        source: "catalog_alias" as const,
      };
    }
  }

  const fallbackRuntimeModel = normalizedRequestedModel === "flash-lite"
    ? input.availableModels.some((model) => model.runtimeModel === "gemini-2.5-flash-lite") ? "gemini-2.5-flash-lite" : "flash_lite"
    : normalizedRequestedModel === "flash_lite"
      ? input.availableModels.some((model) => model.runtimeModel === "gemini-2.5-flash-lite") ? "gemini-2.5-flash-lite" : "flash_lite"
      : normalizedRequestedModel === "pro"
        ? input.availableModels.some((model) => model.runtimeModel === "gemini-2.5-pro") ? "gemini-2.5-pro" : "pro"
        : normalizedRequestedModel === "flash"
          ? input.availableModels.some((model) => model.runtimeModel === "gemini-2.5-flash") ? "gemini-2.5-flash" : "flash"
          : input.defaultRuntimeModel?.trim() || "pro";

  const preferred = findPreferredGeminiModel(input.availableModels, fallbackRuntimeModel);
  if (preferred) {
    return {
      requestedModel,
      selectedLabel: preferred.label,
      runtimeModel: preferred.runtimeModel,
      catalogModelKey: preferred.catalogModelKey,
      family: preferred.family,
      source: "runtime_fallback" as const,
    };
  }

  return {
    requestedModel,
    selectedLabel: requestedModel ?? fallbackRuntimeModel,
    runtimeModel: fallbackRuntimeModel,
    catalogModelKey: requestedModel ? normalize(requestedModel).replace(/\s+/g, "-") : fallbackRuntimeModel,
    family: "unknown" as const,
    source: "runtime_fallback" as const,
  };
}
