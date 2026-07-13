import { describe, expect, it, vi } from "vitest";
import { AntigravityCliCapabilitiesInspector } from "./antigravity-cli-capabilities.js";

describe("AntigravityCliCapabilitiesInspector", () => {
  it("detects supported commands and arguments from help/version output", async () => {
    const inspector = new AntigravityCliCapabilitiesInspector(
      {
        locate: vi.fn(async () => ({
          installed: true as const,
          executablePath: "/usr/local/bin/agy",
          version: "agy 1.2.3",
          searchedLocations: ["/usr/local/bin/agy"],
        })),
      },
      {
        run: vi.fn(async (args: string[]) => ({
          exitCode: 0,
          stdout: args.includes("--help")
            ? "Usage: agy\n models\n login\n logout\n --model <id>\n --print <text>\n --json\n --stream"
            : "agy 1.2.3",
          stderr: "",
          timedOut: false,
          signal: null,
        })),
      },
      1000,
    );

    await expect(inspector.inspect()).resolves.toMatchObject({
      supportsModelListing: true,
      supportsLoginCommand: true,
      supportsLogoutCommand: true,
      supportsModelArgument: true,
      supportsPrintMode: true,
      supportsJsonOutput: true,
      supportsStreaming: true,
    });
  });
});
