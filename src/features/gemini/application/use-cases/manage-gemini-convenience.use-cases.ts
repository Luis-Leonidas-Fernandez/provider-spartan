import { createHash } from "node:crypto";
import { nowIso } from "../../../../shared/date/date.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { Provider } from "../../../provider/domain/provider.types.js";
import type { ProviderAdapterRegistryPort } from "../../../gateway/application/ports/provider-adapter-registry.port.js";
import type { ProviderConnectionStorePort } from "../../../../provider-auth/core/ports/provider-connection-store.port.js";
import type { ProviderConnection, ProviderCredentialMetadata, ValidProviderCredential } from "../../../../provider-auth/core/provider-auth.types.js";
import { parseMetadata, parseScopes } from "../../../../provider-auth/core/provider-auth.utils.js";
import { ProviderConnectionNotConnectedError } from "../../../../provider-auth/core/provider-auth.errors.js";
import type { GeminiRequestAuditRecorderPort } from "../ports/gemini-request-audit-recorder.port.js";
import type { GeminiAvailableModel, GeminiModelCatalogPort } from "../ports/gemini-model-catalog.port.js";
import type { GeminiRuntimeSurface } from "../../../../shared/provider-runtime/gemini-runtime.js";
import { resolveGeminiRequestedModel } from "../services/resolve-gemini-requested-model.js";
import { summarizeGeminiModelCatalog } from "../services/summarize-gemini-model-catalog.js";
import {
  getGeminiRuntimeReconnectMessage,
  getMissingGeminiRuntimeScopes,
} from "../services/gemini-runtime-readiness.js";
import { GeminiRuntimeReconnectRequiredError } from "../gemini.errors.js";
import { classifyLocalCliFailure } from "../../../../shared/local-cli-runtime/local-cli-errors.js";

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findDefaultGeminiProvider(providers: Provider[]) {
  return providers.find((provider) =>
    provider.providerType === "gemini"
    && provider.accessMode === "oauth"
    && provider.isEnabled,
  ) ?? null;
}

function parseConnectionMetadata(connection: ProviderConnection | null): ProviderCredentialMetadata | null {
  return parseMetadata(connection?.metadataJson) ?? null;
}

async function resolveConnectedGeminiContext(input: {
  providerRepository: ProviderRepositoryPort;
  getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>;
  getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>;
}) {
  const providers = await input.providerRepository.findAll();
  const provider = findDefaultGeminiProvider(providers);
  if (!provider) throw new ProviderConnectionNotConnectedError("gemini");
  const connection = await input.getDefaultProviderAuthStatus({
    provider: "gemini",
    providerId: provider.id,
  });
  if (!connection) throw new ProviderConnectionNotConnectedError("gemini");
  const validCredential = await input.getValidProviderCredential(connection.id);

  return {
    provider,
    connection,
    credentialValue: validCredential.accessToken ?? "",
    credentialMetadata: validCredential.metadata ?? parseConnectionMetadata(connection) ?? {},
    connectionScopes: parseScopes(connection.scopesJson),
  };
}

function assertGeminiRuntimeScopeReadiness(input: {
  connection: ProviderConnection;
  runtimeSurface: GeminiRuntimeSurface;
  scopes: string[];
}) {
  const missingScopes = getMissingGeminiRuntimeScopes({
    runtimeSurface: input.runtimeSurface,
    scopes: input.scopes,
  });
  if (missingScopes.length === 0) return;
  throw new GeminiRuntimeReconnectRequiredError(input.connection.id, missingScopes);
}

function getCodeAssistRecord(metadata: ProviderCredentialMetadata | null | undefined) {
  const raw = metadata?.codeAssist;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function summarizePrompt(message: string, system: string | null) {
  const raw = JSON.stringify({ message, system });
  return {
    messageLength: message.length,
    systemLength: system?.length ?? 0,
    totalLength: raw.length,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function summarizeResponse(content: string) {
  return {
    length: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeAuditValue(item));
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token")
      || lowerKey.includes("secret")
      || lowerKey.includes("password")
      || lowerKey.includes("authorization")
      || lowerKey.includes("cookie")
    ) continue;
    result[key] = sanitizeAuditValue(raw);
  }
  return result;
}

function resolveOperationalErrorCode(error: unknown, fallbackMessage?: string) {
  const record = error as { code?: unknown; message?: unknown };
  if (typeof record?.code === "string" && record.code.trim()) return record.code;
  if (typeof fallbackMessage === "string" && fallbackMessage.trim()) {
    return classifyLocalCliFailure(fallbackMessage).code.toLowerCase();
  }
  return "provider_unavailable";
}

function resolveGeminiFailureAuditPhase(errorCode: string) {
  if (errorCode === "process_cancelled") return "test_message_cancelled" as const;
  if (errorCode === "provider_busy" || errorCode === "queue_full") return "test_message_rejected" as const;
  return "test_message_failed" as const;
}

async function persistGeminiRuntimeStatus(input: {
  connectionStore: ProviderConnectionStorePort;
  connection: ProviderConnection;
  metadata: ProviderCredentialMetadata;
  runtimeStatus: "working" | "failed";
  runtimeSurface: GeminiRuntimeSurface;
  cliAvailable?: boolean | null;
  model?: string | null;
  error?: string | null;
}) {
  const currentCodeAssist = getCodeAssistRecord(input.metadata);
  const currentVerifiedModels = Array.isArray(currentCodeAssist.verifiedWorkingModels)
    ? currentCodeAssist.verifiedWorkingModels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const verifiedWorkingModels = input.runtimeStatus === "working" && input.model
    ? [...new Set([...currentVerifiedModels, input.model])]
    : currentVerifiedModels;

  const nextMetadata: ProviderCredentialMetadata = {
    ...input.metadata,
    codeAssist: {
      ...currentCodeAssist,
      runtimeStatus: input.runtimeStatus,
      runtimeSurface: input.runtimeSurface,
      ...(input.cliAvailable !== undefined ? { cliAvailable: input.cliAvailable } : {}),
      ...(input.runtimeStatus === "working"
        ? {
          lastRuntimeSuccessAt: nowIso(),
          lastRuntimeError: null,
          ...(verifiedWorkingModels.length ? { verifiedWorkingModels } : {}),
        }
        : {
          lastRuntimeFailureAt: nowIso(),
          ...(input.error ? { lastRuntimeError: input.error } : {}),
        }),
    },
  };

  const updatedConnection: ProviderConnection = {
    ...input.connection,
    metadataJson: JSON.stringify(nextMetadata),
    updatedAt: nowIso(),
  };
  await input.connectionStore.update(updatedConnection);
  return updatedConnection;
}

function recommendGeminiModels(models: GeminiAvailableModel[]) {
  const geminiModels = models.filter((model) => model.family === "gemini");
  const fast = geminiModels.find((model) => model.runtimeModel.includes("flash") && model.quality === "medium")
    ?? geminiModels.find((model) => model.runtimeModel.includes("flash"))
    ?? geminiModels[0]
    ?? null;
  const quality = geminiModels.find((model) => model.runtimeModel.includes("pro") && model.quality === "high")
    ?? geminiModels.find((model) => model.runtimeModel.includes("pro"))
    ?? fast;

  return {
    fast: fast?.label ?? null,
    quality: quality?.label ?? null,
    defaultRuntimeModel: quality?.runtimeModel ?? fast?.runtimeModel ?? null,
  };
}

export class ListGeminiModelsUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly runtimeSurface: GeminiRuntimeSurface,
    private readonly modelCatalog: GeminiModelCatalogPort,
    private readonly auditRecorder: GeminiRequestAuditRecorderPort,
  ) {}

  async execute() {
    const providers = await this.providerRepository.findAll();
    const provider = findDefaultGeminiProvider(providers);
    if (!provider) throw new ProviderConnectionNotConnectedError("gemini");
    const connection = await this.getDefaultProviderAuthStatus({ provider: "gemini", providerId: provider.id });
    if (!connection) throw new ProviderConnectionNotConnectedError("gemini");

    const metadata = parseConnectionMetadata(connection) ?? {};
    const codeAssist = getCodeAssistRecord(metadata);
    const verifiedWorkingModels = Array.isArray(codeAssist.verifiedWorkingModels)
      ? codeAssist.verifiedWorkingModels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    try {
      const availableModels = await this.modelCatalog.listAvailableModels();
      const recommendations = recommendGeminiModels(availableModels);
      const catalogSummary = summarizeGeminiModelCatalog(availableModels);
      const discoveredLive = availableModels.some((model) => model.source === "antigravity");
      const response = {
        providerId: provider.id,
        projectId: safeString(codeAssist.projectId),
        runtimeSurface: safeString(codeAssist.runtimeSurface) ?? this.runtimeSurface,
        runtimeStatus: safeString(codeAssist.runtimeStatus) ?? "untested",
        discoverySource: discoveredLive ? "antigravity_cli_models" : "antigravity_static_catalog",
        availableModels,
        knownModels: availableModels.map((model) => model.label),
        knownModelKeys: availableModels.map((model) => model.catalogModelKey),
        verifiedWorkingModels,
        recommendedModel: recommendations.defaultRuntimeModel ?? provider.defaultModel ?? null,
        recommendedLabels: {
          fast: recommendations.fast,
          quality: recommendations.quality,
        },
        notes: discoveredLive
          ? "Available models were discovered live via `agy models` for the local Antigravity session."
          : "Available models are static fallback labels for the Antigravity runtime surface. Use /gemini/models audit output to see label-to-runtime mapping.",
      };
      await this.auditRecorder.record({
        providerId: provider.id,
        phase: "models_discovery_success",
        occurredAt: nowIso(),
        data: {
          runtimeSurface: response.runtimeSurface,
          discoverySource: response.discoverySource,
          modelCount: response.availableModels.length,
          labels: response.availableModels.map((model) => model.label),
          catalogModelKeys: response.availableModels.map((model) => model.catalogModelKey),
          uniqueCatalogModelKeys: catalogSummary.uniqueCatalogModelKeys,
          modelVariantsByKey: catalogSummary.modelVariantsByKey,
          recommendedLabels: response.recommendedLabels,
        },
      });
      return response;
    } catch (error) {
      await this.auditRecorder.record({
        providerId: provider.id,
        phase: "models_discovery_failed",
        occurredAt: nowIso(),
        data: {
          runtimeSurface: safeString(codeAssist.runtimeSurface) ?? this.runtimeSurface,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      throw error;
    }
  }
}

export class TestGeminiConnectionUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: GeminiRequestAuditRecorderPort,
    private readonly runtimeSurface: GeminiRuntimeSurface,
  ) {}

  async execute() {
    const context = await resolveConnectedGeminiContext({
      providerRepository: this.providerRepository,
      getDefaultProviderAuthStatus: this.getDefaultProviderAuthStatus,
      getValidProviderCredential: this.getValidProviderCredential,
    });
    assertGeminiRuntimeScopeReadiness({
      connection: context.connection,
      runtimeSurface: this.runtimeSurface,
      scopes: context.connectionScopes,
    });

    const adapter = this.adapterRegistry.getAdapter(context.provider.providerType);
    try {
      const result = await adapter.testConnection({
        providerId: context.provider.id,
        providerType: context.provider.providerType,
        providerName: context.provider.name,
        baseUrl: context.provider.baseUrl,
        credentialValue: context.credentialValue,
        credentialMetadata: context.credentialMetadata,
      });

      await persistGeminiRuntimeStatus({
        connectionStore: this.connectionStore,
        connection: context.connection,
        metadata: context.credentialMetadata,
        runtimeStatus: result.ok ? "working" : "failed",
        runtimeSurface: this.runtimeSurface,
        cliAvailable: result.ok,
        ...(result.ok ? {} : { error: result.message }),
      });
      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: result.ok ? "test_connection_success" : "test_connection_failed",
        occurredAt: nowIso(),
        data: sanitizeAuditValue({
          runtimeSurface: this.runtimeSurface,
          ...result,
          errorCode: result.ok
            ? null
            : (() => {
                const rawResponse = result.rawResponse as Record<string, unknown> | undefined;
                const normalizedError = rawResponse?.normalizedError as { code?: unknown } | undefined;
                return typeof normalizedError?.code === "string"
                  ? normalizedError.code.toLowerCase()
                  : classifyLocalCliFailure(result.message).code.toLowerCase();
              })(),
        }) as Record<string, unknown>,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof GeminiRuntimeReconnectRequiredError
        ? getGeminiRuntimeReconnectMessage(getMissingGeminiRuntimeScopes({
          runtimeSurface: this.runtimeSurface,
          scopes: context.connectionScopes,
        }))
        : error instanceof Error ? error.message : "Unknown error";
      await persistGeminiRuntimeStatus({
        connectionStore: this.connectionStore,
        connection: context.connection,
        metadata: context.credentialMetadata,
        runtimeStatus: "failed",
        runtimeSurface: this.runtimeSurface,
        cliAvailable: false,
        error: errorMessage,
      });
      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: "test_connection_failed",
        occurredAt: nowIso(),
        data: {
          runtimeSurface: this.runtimeSurface,
          error: errorMessage,
        },
      });
      throw error;
    }
  }
}

export class SendGeminiTestMessageUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: GeminiRequestAuditRecorderPort,
    private readonly runtimeSurface: GeminiRuntimeSurface,
    private readonly modelCatalog: GeminiModelCatalogPort,
  ) {}

  async execute(input: {
    message: string;
    system?: string | null;
    model?: string | null;
    maxTokens?: number | null;
    temperature?: number | null;
    signal?: AbortSignal;
  }) {
    const context = await resolveConnectedGeminiContext({
      providerRepository: this.providerRepository,
      getDefaultProviderAuthStatus: this.getDefaultProviderAuthStatus,
      getValidProviderCredential: this.getValidProviderCredential,
    });
    assertGeminiRuntimeScopeReadiness({
      connection: context.connection,
      runtimeSurface: this.runtimeSurface,
      scopes: context.connectionScopes,
    });

    const adapter = this.adapterRegistry.getAdapter(context.provider.providerType);
    const system = input.system?.trim() ? input.system.trim() : null;
    const availableModels = await this.modelCatalog.listAvailableModels();
    const modelResolution = resolveGeminiRequestedModel({
      availableModels,
      defaultRuntimeModel: context.provider.defaultModel || "pro",
      ...(input.model !== undefined ? { requestedModel: input.model } : {}),
    });
    const request = {
      model: modelResolution.runtimeModel,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: input.message },
      ],
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature !== null && input.temperature !== undefined ? { temperature: input.temperature } : {}),
    };

    try {
      const response = await adapter.chatCompletion(request, {
        providerId: context.provider.id,
        providerType: context.provider.providerType,
        providerName: context.provider.name,
        baseUrl: context.provider.baseUrl,
        credentialValue: context.credentialValue,
        credentialMetadata: context.credentialMetadata,
        ...(input.signal ? { signal: input.signal } : {}),
      });

      await persistGeminiRuntimeStatus({
        connectionStore: this.connectionStore,
        connection: context.connection,
        metadata: context.credentialMetadata,
        runtimeStatus: response.ok ? "working" : "failed",
        runtimeSurface: this.runtimeSurface,
        cliAvailable: response.ok,
        model: modelResolution.selectedLabel,
        ...(response.ok ? {} : { error: response.error ?? "Unknown provider error" }),
      });
      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: response.ok ? "test_message_success" : "test_message_failed",
        occurredAt: nowIso(),
        data: {
          runtimeSurface: this.runtimeSurface,
          requestedModel: modelResolution.requestedModel,
          selectedLabel: modelResolution.selectedLabel,
          runtimeModel: modelResolution.runtimeModel,
          catalogModelKey: modelResolution.catalogModelKey,
          modelFamily: modelResolution.family,
          resolutionSource: modelResolution.source,
          status: response.status,
          latencyMs: response.durationMs,
          usage: response.usage ?? null,
          providerRequestId: response.providerRequestId ?? null,
          error: response.error ?? null,
          promptDiagnostics: summarizePrompt(input.message, system),
          responseDiagnostics: summarizeResponse(response.content),
          responseObservability: sanitizeAuditValue(response.rawResponse),
        },
      });

      return {
        ok: response.ok,
        providerId: context.provider.id,
        model: modelResolution.selectedLabel,
        requestedModel: modelResolution.requestedModel,
        runtimeModel: modelResolution.runtimeModel,
        catalogModelKey: modelResolution.catalogModelKey,
        content: response.content,
        usage: response.usage ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
        },
        durationMs: response.durationMs,
        providerRequestId: response.providerRequestId ?? null,
        ...(response.error ? { error: response.error } : {}),
      };
    } catch (error) {
      const errorMessage = error instanceof GeminiRuntimeReconnectRequiredError
        ? getGeminiRuntimeReconnectMessage(getMissingGeminiRuntimeScopes({
          runtimeSurface: this.runtimeSurface,
          scopes: context.connectionScopes,
        }))
        : error instanceof Error ? error.message : "Unknown error";
      const errorCode = resolveOperationalErrorCode(error, errorMessage);
      await persistGeminiRuntimeStatus({
        connectionStore: this.connectionStore,
        connection: context.connection,
        metadata: context.credentialMetadata,
        runtimeStatus: "failed",
        runtimeSurface: this.runtimeSurface,
        cliAvailable: false,
        model: modelResolution.selectedLabel,
        error: errorMessage,
      });
      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: resolveGeminiFailureAuditPhase(errorCode),
        occurredAt: nowIso(),
        data: {
          runtimeSurface: this.runtimeSurface,
          errorCode,
          requestedModel: modelResolution.requestedModel,
          selectedLabel: modelResolution.selectedLabel,
          runtimeModel: modelResolution.runtimeModel,
          catalogModelKey: modelResolution.catalogModelKey,
          modelFamily: modelResolution.family,
          resolutionSource: modelResolution.source,
          error: errorMessage,
          promptDiagnostics: summarizePrompt(input.message, system),
        },
      });
      throw error;
    }
  }
}
