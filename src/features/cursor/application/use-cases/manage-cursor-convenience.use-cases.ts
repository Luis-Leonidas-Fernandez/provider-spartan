import { createHash } from "node:crypto";
import { AppError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { ProviderHealthStatus } from "../../../provider/domain/provider.types.js";
import type { ProviderAdapterRegistryPort } from "../../../gateway/application/ports/provider-adapter-registry.port.js";
import type { CursorCliCommandRunnerPort } from "../ports/cursor-cli-command-runner.port.js";
import { classifyLocalCliFailure } from "../../../../shared/local-cli-runtime/local-cli-errors.js";
import type { CursorRuntimeIntrospectionPort } from "../ports/cursor-runtime-introspection.port.js";
import type { CursorModelCatalogPort } from "../ports/cursor-model-catalog.port.js";
import type { CursorRequestAuditRecorderPort } from "../ports/cursor-request-audit-recorder.port.js";
import { ensureDefaultCursorProvider } from "../services/cursor-local-provider-record.js";
import { resolveCursorRequestedModel } from "../services/resolve-cursor-requested-model.js";

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

function summarizeText(value: string) {
  return {
    length: value.length,
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

function summarizeResponse(value: unknown) {
  if (!value || typeof value !== "object") return sanitizeAuditValue(value);
  const record = value as Record<string, unknown>;
  return sanitizeAuditValue({
    runtimeSurface: record.runtimeSurface,
    workspaceMode: record.workspaceMode,
    outputFormat: record.outputFormat,
    usageSource: record.usageSource,
    parsed: record.parsed,
    executionRecord: record.executionRecord,
  });
}

function resolveOperationalErrorCode(error: unknown, fallbackMessage?: string) {
  if (error instanceof AppError) return error.code;
  const record = error as { code?: unknown; message?: unknown };
  if (typeof record?.code === "string" && record.code.trim()) return record.code;
  if (typeof fallbackMessage === "string" && fallbackMessage.trim()) {
    return classifyLocalCliFailure(fallbackMessage).code.toLowerCase();
  }
  return "provider_unavailable";
}

function resolveCursorFailureAuditPhase(errorCode: string) {
  if (errorCode === "process_cancelled") return "test_message_cancelled" as const;
  if (errorCode === "provider_busy" || errorCode === "queue_full") return "test_message_rejected" as const;
  return "test_message_failed" as const;
}

async function persistProviderHealth(
  providerRepository: ProviderRepositoryPort,
  providerId: string,
  status: ProviderHealthStatus,
  latencyMs: number | null,
  lastError: string | null,
) {
  const previous = await providerRepository.getHealth(providerId);
  const timestamp = nowIso();
  await providerRepository.upsertHealth({
    providerId,
    status,
    lastCheckedAt: timestamp,
    lastSuccessAt: status === "healthy" ? timestamp : previous?.lastSuccessAt ?? null,
    lastError,
    latencyMs,
  });
}

export class GetCursorConnectInstructionsUseCase {
  constructor(private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort) {}

  async execute() {
    const status = await this.runtimeIntrospection.inspect();
    const supportsLocalLogin = Boolean(status.capabilities?.supportsLogin);
    return {
      provider: status.provider,
      executionMode: status.executionMode,
      authMethod: "cursor-account",
      cli: status.cli,
      capabilities: status.capabilities,
      localCliState: status.state,
      localCliActions: status.actions,
      localCliMessage: status.message,
      localCliAuthenticated: status.authentication.authenticated,
      authStartUrl: supportsLocalLogin ? "/cursor/auth/start" : null,
      statusUrl: "/cursor/status",
      instructions: supportsLocalLogin
        ? [
            "1. Iniciá `POST /cursor/auth/start` para abrir el flujo local de Cursor CLI.",
            "2. Escuchá eventos por SSE en `/cursor/auth/:flowId/events`.",
            "3. Si el CLI solicita input, enviá el valor a `POST /cursor/auth/:flowId/input`.",
          ]
        : [
            "La versión actual del Cursor CLI no expone un flujo de login verificable por este gateway.",
            "Verificá `GET /cursor/capabilities` y actualizá el CLI antes de intentar autenticación local.",
          ],
    };
  }
}

export class LogoutCursorUseCase {
  constructor(
    private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort,
    private readonly runner: CursorCliCommandRunnerPort,
    private readonly timeoutMs: number,
  ) {}

  async execute() {
    const before = await this.runtimeIntrospection.inspect();
    if (!before.cli.installed) {
      throw new AppError("Cursor CLI is not installed", 503, "cursor_cli_not_installed");
    }
    if (!before.capabilities?.supportsLogout) {
      throw new AppError("Cursor CLI logout is not supported by the detected version", 501, "cursor_logout_not_supported");
    }

    const result = await this.runner.run(["logout"], { timeoutMs: this.timeoutMs });
    if (result.exitCode !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || "Cursor CLI logout failed";
      throw new AppError(message, 502, "cursor_logout_failed");
    }

    const after = await this.runtimeIntrospection.inspect();
    return {
      loggedOut: !after.authentication.authenticated,
      state: after.state,
      message: after.message,
    };
  }
}

export class ListCursorModelsUseCase {
  constructor(
    private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort,
    private readonly modelCatalog: CursorModelCatalogPort,
    private readonly auditRecorder: CursorRequestAuditRecorderPort,
  ) {}

  async execute() {
    const status = await this.runtimeIntrospection.inspect();
    if (!status.cli.installed) {
      throw new AppError("Cursor CLI is not installed", 503, "cursor_cli_not_installed");
    }
    if (!status.capabilities?.supportsModelListing) {
      throw new AppError("Cursor CLI model listing is not supported by the detected version", 501, "cursor_model_listing_not_supported");
    }
    if (!status.authentication.authenticated) {
      throw new AppError("Cursor CLI authentication is required before listing models", 401, "cursor_auth_required");
    }

    try {
      const availableModels = await this.modelCatalog.listAvailableModels();
      const response = {
        provider: "cursor-cli-subscription",
        executionMode: status.executionMode,
        discoverySource: "cursor_cli_models",
        availableModels,
        knownModels: availableModels.map((model) => model.displayName),
        knownModelIds: availableModels.map((model) => model.id),
        notes: "Available models were discovered from the local Cursor CLI session.",
      };
      await this.auditRecorder.record({
        providerId: "cursor-cli-subscription",
        phase: "models_discovery_success",
        occurredAt: nowIso(),
        data: {
          discoverySource: response.discoverySource,
          modelCount: response.availableModels.length,
          labels: response.availableModels.map((model) => model.displayName),
          modelIds: response.availableModels.map((model) => model.id),
        },
      });
      return response;
    } catch (error) {
      await this.auditRecorder.record({
        providerId: "cursor-cli-subscription",
        phase: "models_discovery_failed",
        occurredAt: nowIso(),
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      throw error;
    }
  }
}

export class TestCursorConnectionUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: CursorRequestAuditRecorderPort,
  ) {}

  async execute() {
    const provider = await ensureDefaultCursorProvider(this.providerRepository);
    const status = await this.runtimeIntrospection.inspect();
    if (!status.cli.installed) {
      throw new AppError("Cursor CLI is not installed", 503, "cursor_cli_not_installed");
    }
    if (!status.authentication.authenticated) {
      throw new AppError("Cursor CLI authentication is required before testing the connection", 401, "cursor_auth_required");
    }

    const adapter = this.adapterRegistry.getAdapter(provider.providerType);
    const result = await adapter.testConnection({
      providerId: provider.id,
      providerType: provider.providerType,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      credentialValue: null,
      credentialMetadata: {
        authMethod: "cursor-local-cli",
      },
    });

    await persistProviderHealth(
      this.providerRepository,
      provider.id,
      result.ok ? "healthy" : "down",
      result.latencyMs,
      result.ok ? null : result.message,
    );

    await this.auditRecorder.record({
      providerId: provider.id,
      phase: result.ok ? "test_connection_success" : "test_connection_failed",
      occurredAt: nowIso(),
      data: sanitizeAuditValue({
        kind: "test_connection",
        status: result.status,
        ok: result.ok,
        latencyMs: result.latencyMs,
        message: result.message,
        rawResponse: result.rawResponse,
      }) as Record<string, unknown>,
    });

    return result;
  }
}

export class TestCursorMessageUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort,
    private readonly modelCatalog: CursorModelCatalogPort,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: CursorRequestAuditRecorderPort,
  ) {}

  async execute(input: {
    message: string;
    model?: string | null;
    system?: string | null;
    maxTokens?: number | null;
    temperature?: number | null;
    signal?: AbortSignal;
  }) {
    const provider = await ensureDefaultCursorProvider(this.providerRepository);
    const status = await this.runtimeIntrospection.inspect();
    if (!status.cli.installed) {
      throw new AppError("Cursor CLI is not installed", 503, "cursor_cli_not_installed");
    }
    if (!status.authentication.authenticated) {
      throw new AppError("Cursor CLI authentication is required before sending messages", 401, "cursor_auth_required");
    }

    const availableModels = await this.modelCatalog.listAvailableModels();
    if (availableModels.length === 0) {
      throw new AppError("Cursor CLI did not expose any available models", 409, "cursor_models_unavailable");
    }
    const resolvedModel = resolveCursorRequestedModel({
      ...(input.model !== undefined ? { requestedModel: input.model } : {}),
      availableModels,
    });

    const adapter = this.adapterRegistry.getAdapter(provider.providerType);
    const request = {
      model: resolvedModel.selectedId,
      messages: [
        ...(input.system?.trim() ? [{ role: "system" as const, content: input.system.trim() }] : []),
        { role: "user" as const, content: input.message },
      ],
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature !== null && input.temperature !== undefined ? { temperature: input.temperature } : {}),
    };

    try {
      const response = await adapter.chatCompletion(request, {
        providerId: provider.id,
        providerType: provider.providerType,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        credentialValue: null,
        credentialMetadata: {
          authMethod: "cursor-local-cli",
        },
        signal: input.signal,
      });

      await persistProviderHealth(
        this.providerRepository,
        provider.id,
        "healthy",
        response.durationMs,
        null,
      );

      await this.auditRecorder.record({
        providerId: provider.id,
        phase: "test_message_success",
        occurredAt: nowIso(),
        data: {
          requestedModel: resolvedModel.requestedModel,
          selectedModelLabel: resolvedModel.selectedDisplayName,
          runtimeModel: resolvedModel.selectedId,
          selectionSource: resolvedModel.source,
          prompt: summarizeText(JSON.stringify({
            message: input.message,
            system: input.system ?? null,
          })),
          response: summarizeText(response.content),
          durationMs: response.durationMs,
          rawResponse: summarizeResponse(response.rawResponse),
        },
      });

      return {
        ok: true,
        providerId: provider.id,
        model: resolvedModel.selectedDisplayName,
        requestedModel: resolvedModel.requestedModel,
        runtimeModel: resolvedModel.selectedId,
        catalogModelKey: resolvedModel.selectedId,
        content: response.content,
        usage: response.usage ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
        },
        durationMs: response.durationMs,
        providerRequestId: response.providerRequestId ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const errorCode = resolveOperationalErrorCode(error, message);
      await persistProviderHealth(
        this.providerRepository,
        provider.id,
        "down",
        null,
        message,
      );
      await this.auditRecorder.record({
        providerId: provider.id,
        phase: resolveCursorFailureAuditPhase(errorCode),
        occurredAt: nowIso(),
        data: {
          requestedModel: resolvedModel.requestedModel,
          selectedModelLabel: resolvedModel.selectedDisplayName,
          runtimeModel: resolvedModel.selectedId,
          selectionSource: resolvedModel.source,
          prompt: summarizeText(JSON.stringify({
            message: input.message,
            system: input.system ?? null,
          })),
          errorCode,
          error: message,
        },
      });
      throw error;
    }
  }
}
