import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { ProviderConnection } from "../../../../provider-auth/core/provider-auth.types.js";
import type { GeminiRuntimeSurface } from "../../../../shared/provider-runtime/gemini-runtime.js";
import type { AntigravityRuntimeIntrospectionPort } from "../ports/antigravity-runtime-introspection.port.js";
import type { GeminiConcurrencyInspectorPort } from "../ports/gemini-concurrency-inspector.port.js";
import {
  getConnectionStatusMessage,
  getConnectionStatusReason,
  parseMetadata,
  parseScopes,
  shouldReconnectForStatus,
} from "../../../../provider-auth/core/provider-auth.utils.js";
import { LOCAL_OS_USER_IDENTITY_MODEL } from "../../../../shared/local-cli-runtime/local-cli-runtime.types.js";
import {
  getGeminiRuntimeReconnectMessage,
  getMissingGeminiRuntimeScopes,
  requiresGeminiRuntimeReconnect,
} from "../services/gemini-runtime-readiness.js";

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findDefaultGeminiProvider(providers: Awaited<ReturnType<ProviderRepositoryPort["findAll"]>>) {
  return providers.find((provider) =>
    provider.providerType === "gemini"
    && provider.accessMode === "oauth"
    && provider.isEnabled,
  ) ?? null;
}

function presentConnectionLifecycle(connection: ProviderConnection | null) {
  if (!connection) {
    return {
      connected: false,
      reconnectRequired: true,
      reason: "not_connected" as const,
      message: "Provider is not connected",
    };
  }

  return {
    connected: connection.status === "connected",
    reconnectRequired: shouldReconnectForStatus(connection.status),
    reason: getConnectionStatusReason(connection.status),
    message: getConnectionStatusMessage(connection.status),
  };
}

export class GetGeminiAuthStatusUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly runtimeSurface: GeminiRuntimeSurface,
    private readonly antigravityRuntime: AntigravityRuntimeIntrospectionPort,
    private readonly concurrencyInspector: GeminiConcurrencyInspectorPort,
  ) {}

  async execute() {
    const antigravityStatus = await this.antigravityRuntime.inspect();
    const concurrency = this.concurrencyInspector.getSnapshot();
    const providers = await this.providerRepository.findAll();
    const provider = findDefaultGeminiProvider(providers);
    if (!provider) {
      return {
        connected: false,
        reconnectRequired: true,
        reason: "not_connected",
        message: "Provider is not connected",
        providerId: null,
        loginStatus: "unknown",
        refreshTokenExists: false,
        tokenExpiresAt: null,
        lastRefreshAt: null,
        accountEmail: null,
        accountName: null,
        googleSubject: null,
        scopes: [],
        integrationVariant: "gemini-cli-code-assist",
        codeAssist: null,
        executionMode: antigravityStatus.executionMode,
        identityScope: LOCAL_OS_USER_IDENTITY_MODEL,
        identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
        concurrency,
        cli: antigravityStatus.cli,
        capabilities: antigravityStatus.capabilities,
        localCliState: antigravityStatus.state,
        localCliActions: antigravityStatus.actions,
        localCliMessage: antigravityStatus.message,
        localCliAuthenticated: antigravityStatus.authentication.authenticated,
        runtimeSurface: this.runtimeSurface,
        cliAvailable: antigravityStatus.cli.installed,
        runtimeStatus: "not_connected",
        verifiedWorkingModels: [],
        lastRuntimeError: null,
      };
    }

    const connection = await this.getDefaultProviderAuthStatus({
      provider: "gemini",
      providerId: provider.id,
    });
    const metadata = parseMetadata(connection?.metadataJson);
    const lifecycle = presentConnectionLifecycle(connection);
    const scopes = connection ? parseScopes(connection.scopesJson) : [];
    const missingRequiredScopes = getMissingGeminiRuntimeScopes({
      runtimeSurface: this.runtimeSurface,
      scopes,
    });
    const runtimeReconnectRequired = lifecycle.connected && requiresGeminiRuntimeReconnect({
      runtimeSurface: this.runtimeSurface,
      scopes,
    });
    const codeAssist = metadata?.codeAssist && typeof metadata.codeAssist === "object"
      ? metadata.codeAssist as Record<string, unknown>
      : null;
    const presentedReason = runtimeReconnectRequired ? "missing_required_scope" : lifecycle.reason;
    const presentedMessage = runtimeReconnectRequired
      ? getGeminiRuntimeReconnectMessage(missingRequiredScopes)
      : lifecycle.message;
    const presentedRuntimeStatus = runtimeReconnectRequired
      ? "reconnect_required"
      : codeAssist
        ? safeString(codeAssist.runtimeStatus) ?? "untested"
        : "untested";

    return {
      connected: lifecycle.connected,
      reconnectRequired: lifecycle.reconnectRequired || runtimeReconnectRequired,
      reason: presentedReason,
      message: presentedMessage,
      providerId: provider.id,
      loginStatus: connection
        ? connection.status === "connected"
          ? "authenticated"
          : connection.status === "expired"
            ? "expired"
            : "failed"
        : "unknown",
      refreshTokenExists: Boolean(connection?.encryptedRefreshToken),
      tokenExpiresAt: connection?.tokenExpiresAt ?? null,
      lastRefreshAt: connection?.lastRefreshAt ?? null,
      accountEmail: safeString(metadata?.accountEmail),
      accountName: safeString(metadata?.accountName),
      googleSubject: safeString(metadata?.googleSubject),
      scopes,
      missingRequiredScopes,
      integrationVariant: safeString(metadata?.integrationVariant) ?? "gemini-cli-code-assist",
      executionMode: antigravityStatus.executionMode,
      identityScope: LOCAL_OS_USER_IDENTITY_MODEL,
      identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
      concurrency,
      cli: antigravityStatus.cli,
      capabilities: antigravityStatus.capabilities,
      localCliState: antigravityStatus.state,
      localCliActions: antigravityStatus.actions,
      localCliMessage: antigravityStatus.message,
      localCliAuthenticated: antigravityStatus.authentication.authenticated,
      codeAssist: codeAssist
        ? {
          probeStatus: safeString(codeAssist.probeStatus) ?? "unknown",
          eligibility: safeString(codeAssist.eligibility) ?? "unknown",
          runtimeSurface: safeString(codeAssist.runtimeSurface) ?? this.runtimeSurface,
          runtimeStatus: presentedRuntimeStatus,
          cliAvailable: typeof codeAssist.cliAvailable === "boolean" ? codeAssist.cliAvailable : null,
          lastRuntimeError: safeString(codeAssist.lastRuntimeError),
          projectId: safeString(codeAssist.projectId),
          checkedAt: safeString(codeAssist.checkedAt),
          error: safeString(codeAssist.error),
          verifiedWorkingModels: Array.isArray(codeAssist.verifiedWorkingModels)
            ? codeAssist.verifiedWorkingModels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [],
        }
        : null,
      runtimeSurface: codeAssist ? safeString(codeAssist.runtimeSurface) ?? this.runtimeSurface : this.runtimeSurface,
      cliAvailable: codeAssist && typeof codeAssist.cliAvailable === "boolean"
        ? codeAssist.cliAvailable
        : antigravityStatus.cli.installed,
      runtimeReady: lifecycle.connected && !runtimeReconnectRequired && antigravityStatus.state === "ready",
      runtimeStatus: presentedRuntimeStatus,
      verifiedWorkingModels: codeAssist && Array.isArray(codeAssist.verifiedWorkingModels)
        ? codeAssist.verifiedWorkingModels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      lastRuntimeError: codeAssist ? safeString(codeAssist.lastRuntimeError) : null,
    };
  }
}

export class GetGeminiCapabilitiesUseCase {
  constructor(private readonly antigravityRuntime: AntigravityRuntimeIntrospectionPort) {}

  async execute() {
    const snapshot = await this.antigravityRuntime.inspect();
    return {
      provider: snapshot.provider,
      executionMode: snapshot.executionMode,
      cli: snapshot.cli,
      capabilities: snapshot.capabilities,
      state: snapshot.state,
      actions: snapshot.actions,
      message: snapshot.message,
      identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
    };
  }
}
