export type CodexModelDiscoverySnapshot = {
  discoveredAt: string;
  discoverySource: string;
  accountAvailableModels: string[];
  rawModelPermissions: string[];
  codexMiniModels: string[];
  notes?: string | null;
};

export const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";

const STATIC_FALLBACK_CODEX_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  DEFAULT_CODEX_MODEL,
] as const;

function parseModelVersion(model: string) {
  const match = model.match(/gpt-(\d+(?:\.\d+)?)/i);
  return match ? Number.parseFloat(match[1]!) : Number.NaN;
}

function pickBestModel(models: string[]) {
  return [...models]
    .sort((left, right) => {
      const rightVersion = parseModelVersion(right);
      const leftVersion = parseModelVersion(left);
      if (Number.isFinite(rightVersion) && Number.isFinite(leftVersion) && rightVersion !== leftVersion) {
        return rightVersion - leftVersion;
      }
      return right.localeCompare(left);
    })[0] ?? null;
}

export function resolveRecommendedCodexModel(
  accountModelDiscovery: CodexModelDiscoverySnapshot | null,
  providerDefaultModel?: string | null,
) {
  const codexMiniModels = accountModelDiscovery?.codexMiniModels ?? [];
  const recommendedFromAccount = pickBestModel(codexMiniModels);
  if (recommendedFromAccount) return recommendedFromAccount;

  const trimmedProviderDefault = providerDefaultModel?.trim();
  if (trimmedProviderDefault && trimmedProviderDefault !== "gpt-5") return trimmedProviderDefault;

  return pickBestModel([...STATIC_FALLBACK_CODEX_MODELS]) ?? DEFAULT_CODEX_MODEL;
}

export function normalizeCodexModel(
  input: string | null | undefined,
  options?: {
    accountModelDiscovery?: CodexModelDiscoverySnapshot | null;
    providerDefaultModel?: string | null | undefined;
  },
) {
  const recommended = resolveRecommendedCodexModel(
    options?.accountModelDiscovery ?? null,
    options?.providerDefaultModel,
  );
  const model = input?.trim();
  if (!model) return recommended;
  if (model === "gpt-5") return recommended;
  return model;
}
