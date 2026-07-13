import { describe, expect, it, vi } from "vitest";
import { CursorCliModelCatalog } from "./cursor-cli-model-catalog.js";

function readyStatus(overrides?: Partial<{ supportsJsonOutput: boolean; supportsModelListing: boolean }>) {
  return {
    inspect: vi.fn(async () => ({
      provider: "cursor-cli-subscription" as const,
      executionMode: "local-cli" as const,
      state: "ready" as const,
      cli: {
        installed: true,
        executable: "agent" as const,
        path: "/usr/local/bin/agent",
        version: "Cursor CLI 1.0.0",
        searchedCandidates: ["agent"],
        searchedLocations: ["/usr/local/bin/agent"],
      },
      authentication: { authenticated: true, method: "cursor-account" as const },
      capabilities: {
        supportsLogin: true,
        supportsStatus: true,
        supportsStatusJson: true,
        supportsLogout: true,
        supportsModelListing: overrides?.supportsModelListing ?? true,
        supportsModelArgument: true,
        supportsPrintMode: true,
        supportsStdinPrompt: true,
        supportsJsonOutput: overrides?.supportsJsonOutput ?? true,
        supportsStreamJsonOutput: false,
        supportsPartialStreaming: false,
        supportsWorkspaceArgument: false,
        supportsSessionResume: false,
        supportsNoBrowserLogin: false,
        supportsTrustArgument: false,
        supportsForceArgument: false,
        detectedArguments: ["models", "--json"],
      },
      actions: [],
      message: "ready",
    })),
  };
}

describe("CursorCliModelCatalog", () => {
  it("parses json model output when available", async () => {
    const catalog = new CursorCliModelCatalog(
      readyStatus(),
      {
        run: vi.fn(async (args: string[]) => {
          expect(args).toEqual(["models", "--json"]);
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              models: [
                { id: "cursor-fast", displayName: "Cursor Fast" },
                { id: "claude-sonnet", displayName: "Claude Sonnet 4.6" },
              ],
            }),
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }),
      },
      5_000,
    );

    const result = await catalog.listAvailableModels();
    expect(result.map((model) => model.id)).toEqual(["cursor-fast", "claude-sonnet"]);
  });

  it("falls back to line parsing when json is unavailable", async () => {
    const catalog = new CursorCliModelCatalog(
      readyStatus({ supportsJsonOutput: false }),
      {
        run: vi.fn(async (args: string[]) => {
          expect(args).toEqual(["models"]);
          return {
            exitCode: 0,
            stdout: "Claude Sonnet 4.6\nGPT-5\n",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }),
      },
      5_000,
    );

    const result = await catalog.listAvailableModels();
    expect(result.map((model) => model.displayName)).toEqual(["Claude Sonnet 4.6", "GPT-5"]);
  });
});
