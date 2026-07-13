import type {
  CursorCliCapabilities,
  CursorCliCommandRunnerPort,
  CursorCliLocatorPort,
  CursorCliStatusAction,
  CursorCliStatusSnapshot,
  CursorProviderConnectionState,
} from "./cursor-cli.types.js";
import { CursorCliCapabilitiesInspector } from "./cursor-cli-capabilities.js";

function buildActions(state: CursorProviderConnectionState): CursorCliStatusAction[] {
  if (state === "cli_not_installed") {
    return [{
      type: "OPEN_INSTALLATION_GUIDE",
      provider: "cursor-cli-subscription",
      label: "Instalar Cursor CLI",
    }];
  }
  if (state === "authentication_required") {
    return [{
      type: "START_AUTHENTICATION",
      label: "Conectar Cursor",
    }];
  }
  return [];
}

function classifyFailure(message: string): {
  state: CursorProviderConnectionState;
  authenticated: boolean;
  message: string;
} {
  const normalized = message.toLowerCase();
  if (/not installed|enoent|cli_not_installed/.test(normalized)) {
    return { state: "cli_not_installed", authenticated: false, message };
  }
  if (/\b(login required|authentication required|required auth|sign in|not logged|unauthorized)\b/.test(normalized)) {
    return { state: "authentication_required", authenticated: false, message };
  }
  if (/no models|models unavailable|no model/.test(normalized)) {
    return { state: "no_models_available", authenticated: true, message };
  }
  if (/quota|credits exhausted|billing|resource_exhausted/.test(normalized)) {
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

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function interpretStatusJson(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const authenticated = typeof record.authenticated === "boolean"
    ? record.authenticated
    : typeof record.loggedIn === "boolean"
      ? record.loggedIn
      : typeof record.isAuthenticated === "boolean"
        ? record.isAuthenticated
        : typeof record.status === "string"
          ? ["authenticated", "ready", "connected", "logged_in"].includes(record.status.toLowerCase())
          : null;

  const models = Array.isArray(record.models)
    ? record.models
    : Array.isArray(record.availableModels)
      ? record.availableModels
      : null;

  if (authenticated === false) {
    return {
      state: "authentication_required" as const,
      authenticated: false,
      message: hasText(record.message) ? String(record.message) : "Cursor CLI requires login.",
    };
  }

  if (authenticated === true && models && models.length === 0) {
    return {
      state: "no_models_available" as const,
      authenticated: true,
      message: hasText(record.message) ? String(record.message) : "Cursor CLI session authenticated but no models are available.",
    };
  }

  if (authenticated === true) {
    return {
      state: "ready" as const,
      authenticated: true,
      message: hasText(record.message) ? String(record.message) : "Cursor CLI detectado y sesión local disponible.",
    };
  }

  return null;
}

function interpretStatusText(message: string) {
  const normalized = message.toLowerCase();
  if (/\b(logged in|authenticated|ready|connected)\b/.test(normalized)) {
    return {
      state: "ready" as const,
      authenticated: true,
      message,
    };
  }
  if (/\b(not logged|login required|authentication required|sign in)\b/.test(normalized)) {
    return {
      state: "authentication_required" as const,
      authenticated: false,
      message,
    };
  }
  if (/no models/.test(normalized)) {
    return {
      state: "no_models_available" as const,
      authenticated: true,
      message,
    };
  }
  return null;
}

export class CursorCliStatusService {
  private readonly capabilitiesInspector: CursorCliCapabilitiesInspector;
  private readonly timeoutMs: number;

  constructor(
    private readonly locator: CursorCliLocatorPort,
    private readonly runner: CursorCliCommandRunnerPort,
    options?: { capabilitiesInspector?: CursorCliCapabilitiesInspector; timeoutMs?: number },
  ) {
    this.capabilitiesInspector = options?.capabilitiesInspector ?? new CursorCliCapabilitiesInspector(locator, runner, options?.timeoutMs);
    this.timeoutMs = options?.timeoutMs ?? 5_000;
  }

  async inspect(): Promise<CursorCliStatusSnapshot> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      return {
        provider: "cursor-cli-subscription",
        executionMode: "local-cli",
        state: "cli_not_installed",
        cli: {
          installed: false,
          executable: null,
          path: null,
          version: null,
          searchedCandidates: detection.searchedCandidates,
          searchedLocations: detection.searchedLocations,
        },
        authentication: {
          authenticated: false,
          method: "cursor-account",
        },
        capabilities: null,
        actions: buildActions("cli_not_installed"),
        message: "Cursor CLI no está instalado o no pudo encontrarse.",
      };
    }

    const capabilities = await this.capabilitiesInspector.inspect();
    const base = {
      provider: "cursor-cli-subscription" as const,
      executionMode: "local-cli" as const,
      cli: {
        installed: true,
        executable: detection.executableName,
        path: detection.executablePath,
        version: detection.version,
        searchedCandidates: detection.searchedCandidates,
        searchedLocations: detection.searchedLocations,
      },
      capabilities,
    };

    if (!capabilities) {
      return {
        ...base,
        state: "cli_installed",
        authentication: { authenticated: false, method: "cursor-account" as const },
        actions: [],
        message: "Cursor CLI detectado, pero no se pudieron inspeccionar sus capacidades.",
      };
    }

    if (capabilities.supportsStatus) {
      const statusSnapshot = await this.inspectViaStatus(base, capabilities);
      if (statusSnapshot) return statusSnapshot;
    }

    if (capabilities.supportsModelListing) {
      return await this.inspectViaModels(base);
    }

    return {
      ...base,
      state: "cli_installed" as const,
      authentication: { authenticated: false, method: "cursor-account" as const },
      actions: [],
      message: "Cursor CLI detectado, pero no se pudo verificar autenticación ni listado de modelos.",
    };
  }

  private async inspectViaStatus(
    base: Omit<CursorCliStatusSnapshot, "state" | "authentication" | "actions" | "message">,
    capabilities: CursorCliCapabilities,
  ): Promise<CursorCliStatusSnapshot | null> {
    const commands = capabilities.supportsStatusJson
      ? [["status", "--json"], ["status"]]
      : [["status"]];

    for (const args of commands) {
      try {
        const result = await this.runner.run(args, { timeoutMs: this.timeoutMs });
        const combined = result.stdout.trim() || result.stderr.trim() || `Cursor CLI exited with code ${result.exitCode}`;

        if (result.exitCode === 0) {
          if (args.includes("--json")) {
            try {
              const parsed = JSON.parse(result.stdout);
              const interpreted = interpretStatusJson(parsed);
              if (interpreted) {
                return {
                  ...base,
                  state: interpreted.state,
                  authentication: { authenticated: interpreted.authenticated, method: "cursor-account" },
                  actions: buildActions(interpreted.state),
                  message: interpreted.message,
                };
              }
            } catch {
              // ignore malformed status json and try text fallback
            }
          }

          const interpretedText = interpretStatusText(combined);
          return {
            ...base,
            state: interpretedText?.state ?? "ready",
            authentication: { authenticated: interpretedText?.authenticated ?? true, method: "cursor-account" },
            actions: buildActions(interpretedText?.state ?? "ready"),
            message: interpretedText?.message ?? "Cursor CLI detectado y sesión local disponible.",
          };
        }

        const classified = classifyFailure(combined);
        return {
          ...base,
          state: classified.state,
          authentication: { authenticated: classified.authenticated, method: "cursor-account" },
          actions: buildActions(classified.state),
          message: classified.message,
        };
      } catch (error) {
        const classified = classifyFailure(error instanceof Error ? error.message : "Unknown Cursor CLI error");
        return {
          ...base,
          state: classified.state,
          authentication: { authenticated: classified.authenticated, method: "cursor-account" },
          actions: buildActions(classified.state),
          message: classified.message,
        };
      }
    }

    return null;
  }

  private async inspectViaModels(
    base: Omit<CursorCliStatusSnapshot, "state" | "authentication" | "actions" | "message">,
  ): Promise<CursorCliStatusSnapshot> {
    try {
      const result = await this.runner.run(["models"], { timeoutMs: this.timeoutMs });
      const combined = result.stdout.trim() || result.stderr.trim() || `Cursor CLI exited with code ${result.exitCode}`;
      if (result.exitCode === 0) {
        const lines = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
        const state = lines.length > 0 ? "ready" : "no_models_available";
        return {
          ...base,
          state,
          authentication: { authenticated: true, method: "cursor-account" },
          actions: buildActions(state),
          message: state === "ready"
            ? "Cursor CLI detectado y modelos disponibles."
            : "Cursor CLI autenticado, pero sin modelos disponibles.",
        };
      }

      const classified = classifyFailure(combined);
      return {
        ...base,
        state: classified.state,
        authentication: { authenticated: classified.authenticated, method: "cursor-account" },
        actions: buildActions(classified.state),
        message: classified.message,
      };
    } catch (error) {
      const classified = classifyFailure(error instanceof Error ? error.message : "Unknown Cursor CLI error");
      return {
        ...base,
        state: classified.state,
        authentication: { authenticated: classified.authenticated, method: "cursor-account" },
        actions: buildActions(classified.state),
        message: classified.message,
      };
    }
  }
}
