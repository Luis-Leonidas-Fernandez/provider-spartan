import type { GeminiModelCatalogPort, GeminiAvailableModel } from "../application/ports/gemini-model-catalog.port.js";
import type { GeminiCliRunner } from "../../../shared/provider-runtime/gemini-runtime.js";
import { DEFAULT_ANTIGRAVITY_CLI_BIN, DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS, type GeminiRuntimeSurface } from "../../../shared/provider-runtime/gemini-runtime.js";
import { NodeAntigravityCliRunner } from "../../../integrations/antigravity-cli/antigravity-cli-runner.js";
import { AntigravityCliLocator } from "../../../integrations/antigravity-cli/antigravity-cli-locator.js";
import { describeAntigravityModelLabel } from "../../../integrations/provider-adapters/antigravity-model-descriptor.js";

export function parseAntigravityModelsOutput(stdout: string): GeminiAvailableModel[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => {
      const descriptor = describeAntigravityModelLabel(label);
      return {
        label,
        runtimeModel: descriptor.runtimeModel,
        catalogModelKey: descriptor.catalogModelKey,
        family: descriptor.family,
        quality: descriptor.quality,
        aliases: descriptor.aliases,
        source: "antigravity" as const,
      };
    });
}

export class AntigravityGeminiModelCatalog implements GeminiModelCatalogPort {
  private readonly runner: GeminiCliRunner;
  private readonly cliBin: string;
  private readonly timeoutMs: number;

  constructor(options?: { cliBin?: string; timeoutMs?: number; runner?: GeminiCliRunner }) {
    this.cliBin = options?.cliBin?.trim() || DEFAULT_ANTIGRAVITY_CLI_BIN;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS;
    this.runner = options?.runner ?? new NodeAntigravityCliRunner(new AntigravityCliLocator({
      explicitBinaryName: this.cliBin,
      ...(this.cliBin.includes("/") || this.cliBin.includes("\\") ? { explicitPath: this.cliBin } : {}),
    }));
  }

  async listAvailableModels(): Promise<GeminiAvailableModel[]> {
    const result = await this.runner.run(["models"], { timeoutMs: this.timeoutMs });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `Antigravity CLI exited with code ${result.exitCode}`);
    }
    return parseAntigravityModelsOutput(result.stdout);
  }
}

export class ResilientGeminiModelCatalog implements GeminiModelCatalogPort {
  constructor(
    private readonly primary: GeminiModelCatalogPort,
    private readonly fallback: GeminiModelCatalogPort,
  ) {}

  async listAvailableModels(): Promise<GeminiAvailableModel[]> {
    try {
      const models = await this.primary.listAvailableModels();
      if (models.some((model) => model.family !== "unknown")) return models;
    } catch {
      // fall through to fallback
    }
    return await this.fallback.listAvailableModels();
  }
}

export class FallbackGeminiModelCatalog implements GeminiModelCatalogPort {
  constructor(
    private readonly runtimeSurface: GeminiRuntimeSurface,
    private readonly fallbackLabels: string[],
  ) {}

  async listAvailableModels(): Promise<GeminiAvailableModel[]> {
    return this.fallbackLabels.map((label) => {
      const descriptor = describeAntigravityModelLabel(label);
      return {
        label,
        runtimeModel: descriptor.runtimeModel,
        catalogModelKey: descriptor.catalogModelKey,
        family: descriptor.family,
        quality: descriptor.quality,
        aliases: descriptor.aliases,
        source: "static_fallback" as const,
      };
    });
  }
}
