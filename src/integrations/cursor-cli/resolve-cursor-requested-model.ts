import type { CursorAvailableModel } from "./cursor-model-catalog.types.js";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export type ResolvedCursorRequestedModel = {
  requestedModel: string | null;
  selectedId: string;
  selectedDisplayName: string;
  source: "catalog_display_name" | "catalog_id" | "catalog_alias" | "fallback_first_available";
};

export function resolveCursorRequestedModel(input: {
  requestedModel?: string | null;
  availableModels: CursorAvailableModel[];
}): ResolvedCursorRequestedModel {
  const requestedModel = input.requestedModel?.trim() || null;
  const normalized = requestedModel ? normalize(requestedModel) : null;

  if (normalized) {
    const byDisplayName = input.availableModels.find((model) => normalize(model.displayName) === normalized);
    if (byDisplayName) {
      return {
        requestedModel,
        selectedId: byDisplayName.id,
        selectedDisplayName: byDisplayName.displayName,
        source: "catalog_display_name",
      };
    }
    const byId = input.availableModels.find((model) => normalize(model.id) === normalized);
    if (byId) {
      return {
        requestedModel,
        selectedId: byId.id,
        selectedDisplayName: byId.displayName,
        source: "catalog_id",
      };
    }
    const byAlias = input.availableModels.find((model) => model.aliases.some((alias) => normalize(alias) === normalized));
    if (byAlias) {
      return {
        requestedModel,
        selectedId: byAlias.id,
        selectedDisplayName: byAlias.displayName,
        source: "catalog_alias",
      };
    }
  }

  const fallback = input.availableModels[0];
  if (!fallback) {
    return {
      requestedModel,
      selectedId: "unknown",
      selectedDisplayName: requestedModel ?? "unknown",
      source: "fallback_first_available",
    };
  }
  return {
    requestedModel,
    selectedId: fallback.id,
    selectedDisplayName: fallback.displayName,
    source: "fallback_first_available",
  };
}
