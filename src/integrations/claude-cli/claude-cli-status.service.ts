import type { ClaudeCliRunner } from "../provider-adapters/claude-runtime.js";
import type {
  ClaudeCliCapabilities,
  ClaudeCliLocatorPort,
  ClaudeCliStatusAction,
  ClaudeCliStatusSnapshot,
  ClaudeProviderConnectionState,
} from "./claude-cli.types.js";
import { ClaudeCliCapabilitiesInspector } from "./claude-cli-capabilities.js";

function buildActions(state: ClaudeProviderConnectionState): ClaudeCliStatusAction[] {
  if (state === "cli_not_installed") {
    return [{ type: "OPEN_INSTALLATION_GUIDE", provider: "claude-cli-subscription" }];
  }
  if (state === "authentication_required") {
    return [
      { type: "START_AUTHENTICATION", label: "Conectar Claude" },
      { type: "IMPORT_SETUP_TOKEN", label: "Importar setup-token" },
    ];
  }
  return [];
}

function classifyFailure(message: string): {
  state: ClaudeProviderConnectionState;
  authenticated: boolean;
  message: string;
} {
  const normalized = message.toLowerCase();
  if (/not installed|enoent|not found/.test(normalized)) {
    return { state: "cli_not_installed", authenticated: false, message };
  }
  if (/login|sign in|not authenticated|auth required|authentication required/.test(normalized)) {
    return { state: "authentication_required", authenticated: false, message };
  }
  if (/quota|subscription|credits/.test(normalized)) {
    return { state: "quota_exhausted", authenticated: true, message };
  }
  if (/rate.?limit|too many requests|429/.test(normalized)) {
    return { state: "rate_limited", authenticated: true, message };
  }
  if (/update required|please update|upgrade/.test(normalized)) {
    return { state: "update_required", authenticated: false, message };
  }
  if (/temporar|unavailable|try again later|503/.test(normalized)) {
    return { state: "temporarily_unavailable", authenticated: false, message };
  }
  return { state: "error", authenticated: false, message };
}

export class ClaudeCliStatusService {
  private readonly capabilitiesInspector: ClaudeCliCapabilitiesInspector;
  private readonly timeoutMs: number;

  constructor(
    private readonly locator: ClaudeCliLocatorPort,
    private readonly runner: ClaudeCliRunner,
    options?: { capabilitiesInspector?: ClaudeCliCapabilitiesInspector; timeoutMs?: number },
  ) {
    this.capabilitiesInspector = options?.capabilitiesInspector ?? new ClaudeCliCapabilitiesInspector(locator, runner, options?.timeoutMs);
    this.timeoutMs = options?.timeoutMs ?? 5_000;
  }

  private presentInstalledSnapshot(
    detection: { installed: true; executablePath: string; version: string | null; searchedLocations: string[] },
    capabilities: ClaudeCliCapabilities | null,
  ) {
    return {
      provider: "claude-cli-subscription" as const,
      executionMode: "local-cli" as const,
      cli: {
        installed: true,
        path: detection.executablePath,
        version: detection.version,
        searchedLocations: detection.searchedLocations,
      },
      capabilities,
    };
  }

  async inspect(): Promise<ClaudeCliStatusSnapshot> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      return {
        provider: "claude-cli-subscription",
        executionMode: "local-cli",
        state: "cli_not_installed",
        cli: {
          installed: false,
          path: null,
          version: null,
          searchedLocations: detection.searchedLocations,
        },
        authentication: { authenticated: false, method: "unknown" },
        capabilities: null,
        actions: buildActions("cli_not_installed"),
        message: "Claude CLI no está instalado o no pudo encontrarse.",
      };
    }

    const capabilities = await this.capabilitiesInspector.inspect();
    const base = this.presentInstalledSnapshot(detection, capabilities);

    if (!capabilities?.supportsAuthStatus) {
      return {
        ...base,
        state: "cli_installed",
        authentication: { authenticated: false, method: "unknown" },
        actions: [{ type: "IMPORT_SETUP_TOKEN", label: "Importar setup-token" }],
        message: "Claude CLI detectado, pero no expone un comando verificable de auth status en esta versión.",
      };
    }

    try {
      const result = await this.runner.run(["auth", "status"], { timeoutMs: this.timeoutMs });
      if (result.exitCode === 0) {
        return {
          ...base,
          state: "ready",
          authentication: { authenticated: true, method: "claude-subscription" },
          actions: [],
          message: "Claude CLI detectado y sesión local disponible.",
        };
      }

      const classified = classifyFailure(result.stderr.trim() || result.stdout.trim() || `Claude CLI exited with code ${result.exitCode}`);
      return {
        ...base,
        state: classified.state,
        authentication: {
          authenticated: classified.authenticated,
          method: classified.authenticated ? "claude-subscription" : "unknown",
        },
        actions: buildActions(classified.state),
        message: classified.message,
      };
    } catch (error) {
      const classified = classifyFailure(error instanceof Error ? error.message : "Unknown Claude CLI error");
      return {
        ...base,
        state: classified.state,
        authentication: {
          authenticated: classified.authenticated,
          method: classified.authenticated ? "claude-subscription" : "unknown",
        },
        actions: buildActions(classified.state),
        message: classified.message,
      };
    }
  }
}
