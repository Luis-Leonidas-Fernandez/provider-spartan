import { describe, expect, it, vi } from "vitest";
import { CursorCliCapabilitiesInspector } from "./cursor-cli-capabilities.js";

describe("CursorCliCapabilitiesInspector", () => {
  it("detects supported commands and arguments from help text", async () => {
    const locator = {
      locate: vi.fn(async () => ({
        installed: true as const,
        executableName: "agent" as const,
        executablePath: "/usr/local/bin/agent",
        version: "cursor 1.0.0",
        searchedCandidates: ["agent"],
        searchedLocations: ["/usr/local/bin/agent"],
      })),
    };
    const runner = {
      run: vi.fn(async (args: string[]) => {
        const command = args.join(" ");
        if (command === "--help") {
          return { exitCode: 0, stdout: "Usage: agent\nCommands: status login logout models\n--model --print --trust --force", stderr: "", timedOut: false, signal: null };
        }
        if (command === "status --help") {
          return { exitCode: 0, stdout: "status --json", stderr: "", timedOut: false, signal: null };
        }
        if (command === "login --help") {
          return { exitCode: 0, stdout: "login --no-browser", stderr: "", timedOut: false, signal: null };
        }
        if (command === "models --help") {
          return { exitCode: 0, stdout: "models --json-stream --workspace --stdin", stderr: "", timedOut: false, signal: null };
        }
        if (command === "logout --help") {
          return { exitCode: 0, stdout: "logout", stderr: "", timedOut: false, signal: null };
        }
        return { exitCode: 0, stdout: "cursor 1.0.0", stderr: "", timedOut: false, signal: null };
      }),
    };

    const result = await new CursorCliCapabilitiesInspector(locator, runner).inspect();

    expect(result).toMatchObject({
      supportsLogin: true,
      supportsStatus: true,
      supportsStatusJson: true,
      supportsLogout: true,
      supportsModelListing: true,
      supportsModelArgument: true,
      supportsPrintMode: true,
      supportsNoBrowserLogin: true,
      supportsWorkspaceArgument: true,
      supportsTrustArgument: true,
      supportsForceArgument: true,
    });
  });
});
