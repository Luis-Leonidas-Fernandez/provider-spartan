import { describe, expect, it, vi } from "vitest";
import { AntigravityCliStatusService } from "./antigravity-cli-status.service.js";

describe("AntigravityCliStatusService", () => {
  it("reports cli_not_installed when locator cannot find agy", async () => {
    const service = new AntigravityCliStatusService(
      {
        locate: vi.fn(async () => ({
          installed: false as const,
          searchedLocations: ["/usr/local/bin/agy"],
        })),
      },
      {
        run: vi.fn(),
      },
    );

    await expect(service.inspect()).resolves.toMatchObject({
      state: "cli_not_installed",
      authentication: { authenticated: false },
      actions: [{ type: "OPEN_INSTALLATION_GUIDE", provider: "antigravity" }],
    });
  });

  it("reports ready when models command succeeds", async () => {
    const runner = {
      run: vi.fn(async (args: string[]) => {
        if (args.includes("--help")) {
          return {
            exitCode: 0,
            stdout: "models\nlogin\nlogout\n--model\n--print",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }
        if (args.includes("--version")) {
          return {
            exitCode: 0,
            stdout: "agy 1.2.3",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }
        return {
          exitCode: 0,
          stdout: "Gemini 3.5 Flash (Medium)",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }),
    };
    const service = new AntigravityCliStatusService(
      {
        locate: vi.fn(async () => ({
          installed: true as const,
          executablePath: "/usr/local/bin/agy",
          version: "agy 1.2.3",
          searchedLocations: ["/usr/local/bin/agy"],
        })),
      },
      runner,
    );

    await expect(service.inspect()).resolves.toMatchObject({
      state: "ready",
      authentication: { authenticated: true },
      cli: { installed: true, path: "/usr/local/bin/agy" },
    });
  });

  it("classifies authentication failures without claiming the user is authenticated", async () => {
    const runner = {
      run: vi.fn(async (args: string[]) => {
        if (args.includes("--help")) {
          return {
            exitCode: 0,
            stdout: "models\nlogin\nlogout\n--model\n--print",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }
        if (args.includes("--version")) {
          return {
            exitCode: 0,
            stdout: "agy 1.2.3",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: "Please set an Auth method before running models",
          timedOut: false,
          signal: null,
        };
      }),
    };
    const service = new AntigravityCliStatusService(
      {
        locate: vi.fn(async () => ({
          installed: true as const,
          executablePath: "/usr/local/bin/agy",
          version: "agy 1.2.3",
          searchedLocations: ["/usr/local/bin/agy"],
        })),
      },
      runner,
    );

    await expect(service.inspect()).resolves.toMatchObject({
      state: "authentication_required",
      authentication: { authenticated: false },
      actions: [{ type: "OPEN_ANTIGRAVITY_LOGIN", label: "Iniciar sesión en Antigravity CLI" }],
    });
  });
});
