import type { GeminiAvailableModel } from "../ports/gemini-model-catalog.port.js";

export function summarizeGeminiModelCatalog(models: GeminiAvailableModel[]) {
  const uniqueCatalogModelKeys = [...new Set(models.map((model) => model.catalogModelKey))];
  const modelVariantsByKey = Object.fromEntries(
    uniqueCatalogModelKeys.map((catalogModelKey) => [
      catalogModelKey,
      models
        .filter((model) => model.catalogModelKey === catalogModelKey)
        .map((model) => model.label),
    ]),
  );

  return {
    uniqueCatalogModelKeys,
    modelVariantsByKey,
  };
}

