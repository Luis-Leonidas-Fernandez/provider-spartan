import type {
  AntigravityCliCapabilities,
  AntigravityCliLocatorPort,
  AntigravityCliRunner,
  AntigravityCliStatusAction,
  AntigravityCliStatusSnapshot,
  ProviderConnectionState,
} from "./antigravity-cli.types.js";
import { AntigravityCliCapabilitiesInspector } from "./antigravity-cli-capabilities.js";

function buildActions(state: ProviderConnectionState): AntigravityCliStatusAction[] {
  if (state === "cli_not_installed") {
    return [{ type: "OPEN_INSTALLATION_GUIDE", provider: "antigravity" }];
  }
  if (state === "authentication_required") {
    return [{ type: "OPEN_ANTIGRAVITY_LOGIN", label: "Iniciar sesión en Antigravity CLI" }];
  }
  return [];
}

function classifyFailure(message: string): {
  state: ProviderConnectionState;
  authenticated: boolean;
  message: string;
} {
  const normalized = message.toLowerCase();
  if (/not installed|enoent|cli_not_installed/.test(normalized)) {
    return { state: "cli_not_installed", authenticated: false, message };
  }
  if (/login|authenticate|authentication|required auth|loaded cached credentials|set an auth method|sign in/.test(normalized)) {
    return { state: "authentication_required", authenticated: false, message };
  }
  if (/quota|credits are depleted|resource_exhausted|billing/.test(normalized)) {
    return { state: "quota_exhausted", authenticated: true, message };
  }
  if (/rate.?limit|too many requests|429/.test(normalized)) {
    return { state: "rate_limited", authenticated: true, message };
  }
  if (/update required|please update|unsupported client|upgrade/.test(normalized)) {
    return { state: "update_required", authenticated: false, message };
  }
  if (/temporar|unavailable|try again later|503/.test(normalized)) {
    return { state: "temporarily_unavailable", authenticated: false, message };
  }
  return { state: "error", authenticated: false, message };
}

export class AntigravityCliStatusService {
  private readonly capabilitiesInspector: AntigravityCliCapabilitiesInspector;

  constructor(
    private readonly locator: AntigravityCliLocatorPort,
    private readonly runner: AntigravityCliRunner,
    options?: { capabilitiesInspector?: AntigravityCliCapabilitiesInspector; timeoutMs?: number },
  ) {
    this.capabilitiesInspector = options?.capabilitiesInspector ?? new AntigravityCliCapabilitiesInspector(locator, runner, options?.timeoutMs);
    this.timeoutMs = options?.timeoutMs ?? 5_000;
  }

  private readonly timeoutMs: number;

  async inspect(): Promise<AntigravityCliStatusSnapshot> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      return {
        provider: "antigravity",
        executionMode: "local-cli",
        state: "cli_not_installed",
        cli: {
          installed: false,
          path: null,
          version: null,
          searchedLocations: detection.searchedLocations,
        },
        authentication: { authenticated: false },
        capabilities: null,
        actions: buildActions("cli_not_installed"),
        message: "Antigravity CLI no está instalado o no pudo encontrarse.",
      };
    }

    const capabilities = await this.capabilitiesInspector.inspect();
    const base = {
      provider: "antigravity" as const,
      executionMode: "local-cli" as const,
      cli: {
        installed: true,
        path: detection.executablePath,
        version: detection.version,
        searchedLocations: detection.searchedLocations,
      },
      capabilities,
    };

    if (!capabilities?.supportsModelListing) {
      return {
        ...base,
        state: "cli_installed",
        authentication: { authenticated: false },
        actions: [],
        message: "Antigravity CLI detectado, pero no se pudo verificar la capacidad de listar modelos.",
      };
    }

    try {
      const result = await this.runner.run(["models"], { timeoutMs: this.timeoutMs });
      if (result.exitCode === 0) {
        return {
          ...base,
          state: "ready",
          authentication: { authenticated: true },
          actions: [],
          message: "Antigravity CLI detectado y sesión local disponible.",
        };
      }

      const classified = classifyFailure(result.stderr.trim() || result.stdout.trim() || `Antigravity CLI exited with code ${result.exitCode}`);
      return {
        ...base,
        state: classified.state,
        authentication: { authenticated: classified.authenticated },
        actions: buildActions(classified.state),
        message: classified.message,
      };
    } catch (error) {
      const classified = classifyFailure(error instanceof Error ? error.message : "Unknown Antigravity CLI error");
      return {
        ...base,
        state: classified.state,
        authentication: { authenticated: classified.authenticated },
        actions: buildActions(classified.state),
        message: classified.message,
      };
    }
  }
}
