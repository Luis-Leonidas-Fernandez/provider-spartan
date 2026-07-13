import { describe, expect, it, vi } from "vitest";
import { CursorCliCapabilitiesInspector } from "./cursor-cli-capabilities.js";
import { CursorCliStatusService } from "./cursor-cli-status.service.js";

describe("CursorCliStatusService", () => {
  it("returns cli_not_installed when locator cannot find cursor", async () => {
    const service = new CursorCliStatusService(
      {
        locate: vi.fn(async () => ({
          installed: false as const,
          searchedCandidates: ["agent", "cursor-agent"],
          searchedLocations: ["/usr/local/bin/agent"],
        })),
      },
      { run: vi.fn() },
    );

    const result = await service.inspect();
    expect(result.state).toBe("cli_not_installed");
    expect(result.actions[0]?.type).toBe("OPEN_INSTALLATION_GUIDE");
  });

  it("returns authentication_required when status says login is needed", async () => {
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
        if (args[0] === "status") {
          return { exitCode: 1, stdout: "", stderr: "login required", timedOut: false, signal: null };
        }
        return { exitCode: 0, stdout: "", stderr: "", timedOut: false, signal: null };
      }),
    };
    const capabilities = {
      inspect: vi.fn(async () => ({
        supportsLogin: true,
        supportsStatus: true,
        supportsStatusJson: false,
        supportsLogout: true,
        supportsModelListing: true,
        supportsModelArgument: false,
        supportsPrintMode: false,
        supportsStdinPrompt: false,
        supportsJsonOutput: false,
        supportsStreamJsonOutput: false,
        supportsPartialStreaming: false,
        supportsWorkspaceArgument: false,
        supportsSessionResume: false,
        supportsNoBrowserLogin: false,
        supportsTrustArgument: false,
        supportsForceArgument: false,
        detectedArguments: ["status", "login"],
      })),
    };
    const service = new CursorCliStatusService(
      locator,
      runner,
      { capabilitiesInspector: capabilities as unknown as CursorCliCapabilitiesInspector },
    );

    const result = await service.inspect();
    expect(result.state).toBe("authentication_required");
    expect(result.authentication.authenticated).toBe(false);
  });

  it("returns ready when models are available", async () => {
    const locator = {
      locate: vi.fn(async () => ({
        installed: true as const,
        executableName: "cursor-agent" as const,
        executablePath: "/usr/local/bin/cursor-agent",
        version: "cursor 1.0.0",
        searchedCandidates: ["cursor-agent"],
        searchedLocations: ["/usr/local/bin/cursor-agent"],
      })),
    };
    const runner = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "status") {
          return { exitCode: 0, stdout: "authenticated and ready", stderr: "", timedOut: false, signal: null };
        }
        return { exitCode: 0, stdout: "", stderr: "", timedOut: false, signal: null };
      }),
    };
    const capabilities = {
      inspect: vi.fn(async () => ({
        supportsLogin: true,
        supportsStatus: true,
        supportsStatusJson: false,
        supportsLogout: true,
        supportsModelListing: true,
        supportsModelArgument: true,
        supportsPrintMode: true,
        supportsStdinPrompt: true,
        supportsJsonOutput: true,
        supportsStreamJsonOutput: false,
        supportsPartialStreaming: false,
        supportsWorkspaceArgument: false,
        supportsSessionResume: false,
        supportsNoBrowserLogin: false,
        supportsTrustArgument: false,
        supportsForceArgument: false,
        detectedArguments: ["status", "--model", "--print"],
      })),
    };

    const service = new CursorCliStatusService(
      locator,
      runner,
      { capabilitiesInspector: capabilities as unknown as CursorCliCapabilitiesInspector },
    );

    const result = await service.inspect();
    expect(result.state).toBe("ready");
    expect(result.authentication.authenticated).toBe(true);
  });
});
