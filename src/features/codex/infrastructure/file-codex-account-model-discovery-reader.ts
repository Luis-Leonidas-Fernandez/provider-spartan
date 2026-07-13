import fs from "node:fs/promises";
import path from "node:path";
import type {
  CodexAccountModelDiscovery,
  CodexAccountModelDiscoveryReaderPort,
} from "../application/ports/codex-account-model-discovery-reader.port.js";

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseDiscovery(payload: string): CodexAccountModelDiscovery | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.discoveredAt !== "string" || typeof parsed.discoverySource !== "string") return null;
    return {
      discoveredAt: parsed.discoveredAt,
      discoverySource: parsed.discoverySource,
      accountAvailableModels: toStringArray(parsed.accountAvailableModels),
      rawModelPermissions: toStringArray(parsed.rawModelPermissions),
      codexMiniModels: toStringArray(parsed.codexMiniModels),
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } catch {
    return null;
  }
}

export class FileCodexAccountModelDiscoveryReader implements CodexAccountModelDiscoveryReaderPort {
  constructor(private readonly directory: string) {}

  async readLatest() {
    try {
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
      if (files.length === 0) return null;

      const enriched = await Promise.all(files.map(async (file) => {
        const filePath = path.join(this.directory, file.name);
        const stats = await fs.stat(filePath);
        return { filePath, mtimeMs: stats.mtimeMs };
      }));
      enriched.sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const entry of enriched) {
        const parsed = parseDiscovery(await fs.readFile(entry.filePath, "utf8"));
        if (parsed) return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }
}
