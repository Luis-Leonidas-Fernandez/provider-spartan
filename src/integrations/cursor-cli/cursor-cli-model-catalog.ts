import type { CursorCliCapabilities, CursorCliCommandRunnerPort, CursorCliStatusSnapshot } from "./cursor-cli.types.js";
import type { CursorAvailableModel, CursorModelCatalogPort } from "./cursor-model-catalog.types.js";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferAliases(label: string, id: string) {
  const aliases = new Set<string>([id, `cursor-cli/${id}`]);
  const lower = label.toLowerCase();
  if (lower.includes("sonnet")) aliases.add("sonnet");
  if (lower.includes("opus")) aliases.add("opus");
  if (lower.includes("haiku")) aliases.add("haiku");
  if (lower.includes("gpt-5")) aliases.add("gpt-5");
  if (lower.includes("gemini")) aliases.add("gemini");
  return [...aliases];
}

function inferCapabilities(label: string, capabilities: CursorCliCapabilities | null) {
  const lower = label.toLowerCase();
  return {
    streaming: capabilities?.supportsPartialStreaming ?? null,
    tools: lower.includes("agent") ? true : null,
    images: lower.includes("vision") || lower.includes("image") ? true : null,
    fileAccess: true,
  };
}

function normalizeLineModel(line: string, capabilities: CursorCliCapabilities | null): CursorAvailableModel | null {
  const cleaned = line
    .replace(/^[*\-\u2022]\s*/, "")
    .replace(/\s+\(default\)$/i, "")
    .trim();
  if (!cleaned) return null;

  const id = slugify(cleaned);
  if (!id) return null;

  return {
    id,
    provider: "cursor-cli-subscription",
    displayName: cleaned,
    available: true,
    availabilitySource: "cli",
    capabilities: inferCapabilities(cleaned, capabilities),
    aliases: inferAliases(cleaned, id),
    source: "cursor_cli",
  };
}

function parseJsonModels(payload: unknown, capabilities: CursorCliCapabilities | null): CursorAvailableModel[] {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).models)
      ? (payload as Record<string, unknown>).models as unknown[]
      : [];

  const models: CursorAvailableModel[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const normalized = normalizeLineModel(item, capabilities);
      if (normalized) models.push(normalized);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const displayName = typeof record.displayName === "string"
      ? record.displayName
      : typeof record.name === "string"
        ? record.name
        : typeof record.id === "string"
          ? record.id
          : null;
    if (!displayName) continue;
    const id = typeof record.id === "string" && record.id.trim()
      ? slugify(record.id)
      : slugify(displayName);
    models.push({
      id,
      provider: "cursor-cli-subscription",
      displayName,
      available: record.available !== false,
      availabilitySource: "cli",
      capabilities: inferCapabilities(displayName, capabilities),
      aliases: inferAliases(displayName, id),
      source: "cursor_cli",
    });
  }
  return models;
}

function uniqueById(models: CursorAvailableModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export class CursorCliModelCatalog implements CursorModelCatalogPort {
  constructor(
    private readonly statusService: { inspect(): Promise<CursorCliStatusSnapshot> },
    private readonly runner: CursorCliCommandRunnerPort,
    private readonly timeoutMs: number,
  ) {}

  async listAvailableModels(): Promise<CursorAvailableModel[]> {
    const status = await this.statusService.inspect();
    const capabilities = status.capabilities;

    if (!status.cli.installed) return [];
    if (!capabilities?.supportsModelListing) return [];

    const commands = capabilities.supportsJsonOutput
      ? [["models", "--json"], ["models"]]
      : [["models"]];

    for (const args of commands) {
      const result = await this.runner.run(args, { timeoutMs: this.timeoutMs });
      if (result.exitCode !== 0) continue;

      if (args.includes("--json")) {
        try {
          const parsed = JSON.parse(result.stdout);
          const models = uniqueById(parseJsonModels(parsed, capabilities));
          if (models.length > 0) return models;
        } catch {
          // fallback below
        }
      }

      const models = uniqueById(
        result.stdout
          .split("\n")
          .map((line) => normalizeLineModel(line, capabilities))
          .filter((value): value is CursorAvailableModel => value !== null),
      );
      if (models.length > 0) return models;
    }

    return [];
  }
}
