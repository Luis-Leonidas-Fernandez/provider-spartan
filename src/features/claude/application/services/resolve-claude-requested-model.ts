export type ClaudeAvailableModel = {
  label: string;
  runtimeModel: "sonnet" | "opus";
  catalogModelKey: string;
  aliases: string[];
  source: "fallback";
};

export type ResolvedClaudeModel = ClaudeAvailableModel & {
  requestedModel: string;
};

const FALLBACK_CLAUDE_MODELS: ClaudeAvailableModel[] = [
  {
    label: "Claude Sonnet",
    runtimeModel: "sonnet",
    catalogModelKey: "claude-sonnet",
    aliases: ["sonnet", "claude-sonnet", "claude-sonnet-4-6"],
    source: "fallback",
  },
  {
    label: "Claude Opus",
    runtimeModel: "opus",
    catalogModelKey: "claude-opus",
    aliases: ["opus", "claude-opus", "claude-opus-4-6"],
    source: "fallback",
  },
];

export function listFallbackClaudeModels() {
  return FALLBACK_CLAUDE_MODELS.map((model) => ({ ...model, aliases: [...model.aliases] }));
}

export function resolveClaudeRequestedModel(input: string | undefined | null): ResolvedClaudeModel {
  const requestedModel = input?.trim() || "sonnet";
  const normalized = requestedModel.toLowerCase();
  const matched = FALLBACK_CLAUDE_MODELS.find((model) =>
    model.label.toLowerCase() === normalized
    || model.catalogModelKey === normalized
    || model.aliases.includes(normalized),
  ) ?? FALLBACK_CLAUDE_MODELS[0]!;
  return {
    ...matched,
    aliases: [...matched.aliases],
    requestedModel,
  };
}
