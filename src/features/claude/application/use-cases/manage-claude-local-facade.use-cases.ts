import { createHash } from "node:crypto";
import { AppError, BadGatewayError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import { createId } from "../../../../shared/id/id.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { ProviderHealthStatus } from "../../../provider/domain/provider.types.js";
import type { ProviderAdapterRegistryPort } from "../../../gateway/application/ports/provider-adapter-registry.port.js";
import type { ClaudeRequestAuditRecorderPort } from "../ports/claude-request-audit-recorder.port.js";
import type { ClaudeRuntimeIntrospectionPort } from "../ports/claude-runtime-introspection.port.js";
import {
  listFallbackClaudeModels,
  resolveClaudeRequestedModel,
} from "../services/resolve-claude-requested-model.js";
import type { ProviderConnectionStorePort } from "../../../../provider-auth/core/ports/provider-connection-store.port.js";
import type { ProviderAuthCipherPort } from "../../../../provider-auth/core/ports/credential-cipher.port.js";
import type {
  ProviderConnection,
  ProviderCredentialMetadata,
  ValidProviderCredential,
} from "../../../../provider-auth/core/provider-auth.types.js";
import { parseMetadata } from "../../../../provider-auth/core/provider-auth.utils.js";
import {
  ProviderConnectionNotConnectedError,
  ProviderConnectionReconnectRequiredError,
} from "../../../../provider-auth/core/provider-auth.errors.js";
import type { ClaudeRuntimeSurface } from "../../../../shared/provider-runtime/claude-runtime.js";
import { ensureDefaultClaudeProvider } from "../services/claude-local-provider-record.js";
import { classifyLocalCliFailure } from "../../../../shared/local-cli-runtime/local-cli-errors.js";

const CLAUDE_COMPLIANCE_STATUS = "approved_setup_token" as const;

function maskToken(value: string) {
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
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
      || lowerKey.includes("command")
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

function resolveClaudeAuthMethod(metadata: ProviderCredentialMetadata) {
  return typeof metadata.authMethod === "string" ? metadata.authMethod : "unknown";
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

function resolveClaudeFailureAuditPhase(errorCode: string) {
  if (errorCode === "process_cancelled") return "test_message_cancelled" as const;
  if (errorCode === "provider_busy" || errorCode === "queue_full") return "test_message_rejected" as const;
  return "test_message_failed" as const;
}

function summarizeRawResponse(value: unknown) {
  if (!value || typeof value !== "object") return sanitizeAuditValue(value);
  if (Array.isArray(value)) {
    return {
      type: "event_list",
      length: value.length,
      eventTypes: value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        return [record.type, record.event, record.kind].filter((entry): entry is string => typeof entry === "string");
      }),
    };
  }
  const record = value as Record<string, unknown>;
  return sanitizeAuditValue({
    type: record.type,
    event: record.event,
    kind: record.kind,
    eventTypes: Array.isArray(record.eventTypes) ? record.eventTypes : undefined,
    stdoutLength: typeof record.stdoutLength === "number" ? record.stdoutLength : undefined,
    stderrLength: typeof record.stderrLength === "number" ? record.stderrLength : undefined,
    hasUsage: Boolean(extractUsageLike(record)),
  });
}

function extractUsageLike(value: Record<string, unknown>) {
  const usage = value.usage;
  return usage && typeof usage === "object" && !Array.isArray(usage) ? usage : null;
}

function getConnectionMetadata(connection: ProviderConnection | null) {
  return (parseMetadata(connection?.metadataJson) ?? {}) as ProviderCredentialMetadata;
}

async function resolveClaudeConnectionContext(input: {
  providerRepository: ProviderRepositoryPort;
  connectionStore: ProviderConnectionStorePort;
  getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>;
}) {
  const provider = await ensureDefaultClaudeProvider(input.providerRepository);
  const connection = await input.connectionStore.findDefaultByProviderId(provider.id);
  if (!connection) throw new ProviderConnectionNotConnectedError("claude");
  const metadata = getConnectionMetadata(connection);
  const authMethod = typeof metadata.authMethod === "string" ? metadata.authMethod : null;
  if (authMethod === "claude-subscription-local-cli") {
    return {
      provider,
      connection,
      credentialValue: null,
      credentialMetadata: metadata,
    };
  }
  const validCredential = await input.getValidProviderCredential(connection.id);
  return {
    provider,
    connection,
    credentialValue: validCredential.accessToken ?? validCredential.bearerToken ?? null,
    credentialMetadata: validCredential.metadata ?? metadata,
  };
}

async function updateConnectionMetadata(input: {
  connectionStore: ProviderConnectionStorePort;
  connection: ProviderConnection;
  metadata: ProviderCredentialMetadata;
  status?: ProviderConnection["status"];
}) {
  const updated: ProviderConnection = {
    ...input.connection,
    ...(input.status ? { status: input.status } : {}),
    metadataJson: JSON.stringify(input.metadata),
    lastAuthCheckAt: nowIso(),
    updatedAt: nowIso(),
  };
  await input.connectionStore.update(updated);
  return updated;
}

function isClaudeReconnectError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("oauth token expired")
    || normalized.includes("oauth token revoked")
    || normalized.includes("not logged in")
    || normalized.includes("authentication failed")
    || normalized.includes("401")
    || normalized.includes("403")
    || normalized.includes("invalid api key")
    || normalized.includes("auth token");
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

export class GetClaudeConnectInstructionsUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly auditRecorder: ClaudeRequestAuditRecorderPort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
    private readonly runtimeIntrospection: ClaudeRuntimeIntrospectionPort,
  ) {}

  async execute() {
    const provider = await ensureDefaultClaudeProvider(this.providerRepository);
    const cliStatus = await this.runtimeIntrospection.inspect();
    const supportsLocalLogin = Boolean(cliStatus.capabilities?.supportsAuthLogin);
    const response = {
      providerId: provider.id,
      complianceStatus: CLAUDE_COMPLIANCE_STATUS,
      runtimeSurface: this.runtimeSurface,
      authMethod: supportsLocalLogin ? "claude-subscription" : "claude_setup_token",
      preferredAuthMode: supportsLocalLogin ? "local_cli_login" : "setup_token_import",
      executionMode: cliStatus.executionMode,
      cli: cliStatus.cli,
      capabilities: cliStatus.capabilities,
      localCliState: cliStatus.state,
      localCliActions: cliStatus.actions,
      localCliMessage: cliStatus.message,
      localCliAuthenticated: cliStatus.authentication.authenticated,
      authStartUrl: supportsLocalLogin ? "/claude/auth/start" : null,
      instructions: [
        ...(supportsLocalLogin
          ? [
              "1. Iniciá `POST /claude/auth/start` para abrir el flujo local de Claude CLI.",
              "2. Escuchá eventos por SSE en `/claude/auth/:flowId/events`.",
              "3. Si el CLI solicita input, enviá el valor a `POST /claude/auth/:flowId/input`.",
            ]
          : []),
        "4. Como fallback, ejecutá `claude setup-token` en tu terminal.",
        "5. Copiá el token largo generado por Claude Code.",
        "6. Pegalo en `POST /claude/import-token` con `{ \"token\": \"...\" }`.",
      ],
      importUrl: "/claude/import-token",
      statusUrl: "/claude/status",
    };
    await this.auditRecorder.record({
      providerId: provider.id,
      phase: "connect_instructions",
      occurredAt: nowIso(),
      data: {
        runtimeSurface: this.runtimeSurface,
        complianceStatus: CLAUDE_COMPLIANCE_STATUS,
        supportsLocalLogin,
        cliInstalled: cliStatus.cli.installed,
        cliVersion: cliStatus.cli.version,
      },
    });
    return response;
  }
}

export class ImportClaudeSetupTokenUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly credentialCipher: ProviderAuthCipherPort,
    private readonly auditRecorder: ClaudeRequestAuditRecorderPort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
  ) {}

  async execute(input: { token: string; name?: string }) {
    const token = input.token.trim();
    if (!token) throw new AppError("Claude setup token is required", 400, "bad_request");

    const provider = await ensureDefaultClaudeProvider(this.providerRepository);
    const previousConnection = await this.connectionStore.findDefaultByProviderId(provider.id);
    const metadata: ProviderCredentialMetadata = {
      provider: "claude",
      authMethod: "claude_setup_token",
      runtimeSurface: this.runtimeSurface,
      complianceStatus: CLAUDE_COMPLIANCE_STATUS,
      maskedValue: maskToken(token),
      runtimeStatus: "untested",
      verifiedWorkingModels: [],
      lastRuntimeError: null,
    };
    const encryptedToken = this.credentialCipher.encrypt(token);

    const nextConnection: ProviderConnection = previousConnection
      ? {
        ...previousConnection,
        name: input.name?.trim() || previousConnection.name || "Claude Setup Token",
        status: "connected",
        isDefault: true,
        authType: "custom",
        encryptedAccessToken: encryptedToken.encryptedValue,
        metadataJson: JSON.stringify({
          ...getConnectionMetadata(previousConnection),
          ...metadata,
        }),
        tokenExpiresAt: null,
        lastRefreshAt: null,
        lastAuthCheckAt: nowIso(),
        updatedAt: nowIso(),
      }
      : {
        id: createId(),
        providerId: provider.id,
        providerType: "claude",
        authType: "custom",
        name: input.name?.trim() || "Claude Setup Token",
        status: "connected",
        isDefault: true,
        encryptedAccessToken: encryptedToken.encryptedValue,
        encryptedRefreshToken: null,
        encryptedIdToken: null,
        scopesJson: null,
        metadataJson: JSON.stringify(metadata),
        tokenExpiresAt: null,
        lastRefreshAt: null,
        lastAuthCheckAt: nowIso(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

    if (previousConnection) {
      await this.connectionStore.update(nextConnection);
    } else {
      await this.connectionStore.clearDefaultsForProviderId(provider.id);
      await this.connectionStore.create(nextConnection);
    }

    await this.auditRecorder.record({
      providerId: provider.id,
      phase: "import_token_success",
      occurredAt: nowIso(),
      data: {
        connectionId: nextConnection.id,
        authMethod: "claude_setup_token",
        runtimeSurface: this.runtimeSurface,
        maskedValue: maskToken(token),
      },
    });

    return {
      connected: true,
      providerId: provider.id,
      connectionId: nextConnection.id,
      authMethod: "claude_setup_token",
      tokenExists: true,
      maskedValue: maskToken(token),
      runtimeSurface: this.runtimeSurface,
    };
  }
}

export class ListClaudeModelsUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly auditRecorder: ClaudeRequestAuditRecorderPort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
  ) {}

  async execute() {
    const provider = await ensureDefaultClaudeProvider(this.providerRepository);
    const availableModels = listFallbackClaudeModels();
    await this.auditRecorder.record({
      providerId: provider.id,
      phase: "models_discovery_success",
      occurredAt: nowIso(),
      data: {
        runtimeSurface: this.runtimeSurface,
        discoverySource: "static_claude_cli_catalog",
        labels: availableModels.map((model) => model.label),
        catalogModelKeys: availableModels.map((model) => model.catalogModelKey),
      },
    });
    return {
      providerId: provider.id,
      runtimeSurface: this.runtimeSurface,
      complianceStatus: CLAUDE_COMPLIANCE_STATUS,
      discoverySource: "static_claude_cli_catalog",
      availableModels,
      knownModels: availableModels.map((model) => model.label),
      recommendedModel: "sonnet",
      notes: "Claude CLI did not expose a public models discovery command here; using a documented fallback catalog for Sonnet/Opus aliases.",
    };
  }
}

export class TestClaudeConnectionUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: ClaudeRequestAuditRecorderPort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
  ) {}

  async execute() {
    const context = await resolveClaudeConnectionContext({
      providerRepository: this.providerRepository,
      connectionStore: this.connectionStore,
      getValidProviderCredential: this.getValidProviderCredential,
    });
    const adapter = this.adapterRegistry.getAdapter("claude");
    const result = await adapter.testConnection({
      providerId: context.provider.id,
      providerType: context.provider.providerType,
      providerName: context.provider.name,
      baseUrl: context.provider.baseUrl,
      credentialValue: context.credentialValue,
      credentialMetadata: context.credentialMetadata,
    });

    const nextMetadata: ProviderCredentialMetadata = {
      ...context.credentialMetadata,
      runtimeSurface: this.runtimeSurface,
      runtimeStatus: result.ok ? "working" : "failed",
      lastRuntimeError: result.ok ? null : result.message,
      ...(result.ok ? { lastRuntimeSuccessAt: nowIso() } : { lastRuntimeFailureAt: nowIso() }),
    };
    const nextStatus = result.ok ? "connected" : isClaudeReconnectError(result.message) ? "error" : context.connection.status;
    await updateConnectionMetadata({
      connectionStore: this.connectionStore,
      connection: context.connection,
      metadata: nextMetadata,
      ...(nextStatus !== context.connection.status ? { status: nextStatus } : {}),
    });
    await persistProviderHealth(
      this.providerRepository,
      context.provider.id,
      result.ok ? "healthy" : "down",
      result.latencyMs,
      result.ok ? null : result.message,
    );
    await this.auditRecorder.record({
      providerId: context.provider.id,
      phase: result.ok ? "test_connection_success" : "test_connection_failed",
      occurredAt: nowIso(),
      data: {
        runtimeSurface: this.runtimeSurface,
        authMethod: resolveClaudeAuthMethod(context.credentialMetadata),
        status: result.status,
        latencyMs: result.latencyMs,
        message: result.message,
        errorCode: result.ok
          ? null
          : (() => {
              const rawResponse = result.rawResponse as Record<string, unknown> | undefined;
              const normalizedError = rawResponse?.normalizedError as { code?: unknown } | undefined;
              return typeof normalizedError?.code === "string"
                ? normalizedError.code.toLowerCase()
                : classifyLocalCliFailure(result.message).code.toLowerCase();
            })(),
      },
    });
    if (!result.ok && isClaudeReconnectError(result.message)) {
      throw new ProviderConnectionReconnectRequiredError(context.connection.id, "error");
    }
    return result;
  }
}

export class SendClaudeTestMessageUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: ClaudeRequestAuditRecorderPort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
  ) {}

  async execute(input: {
    message: string;
    model?: string;
    system?: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }) {
    const context = await resolveClaudeConnectionContext({
      providerRepository: this.providerRepository,
      connectionStore: this.connectionStore,
      getValidProviderCredential: this.getValidProviderCredential,
    });
    const selectedModel = resolveClaudeRequestedModel(input.model);
    const adapter = this.adapterRegistry.getAdapter("claude");

    try {
      const response = await adapter.chatCompletion({
        model: selectedModel.runtimeModel,
        messages: [
          ...(input.system?.trim() ? [{ role: "system" as const, content: input.system.trim() }] : []),
          { role: "user" as const, content: input.message },
        ],
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
      }, {
        providerId: context.provider.id,
        providerType: context.provider.providerType,
        providerName: context.provider.name,
        baseUrl: context.provider.baseUrl,
        credentialValue: context.credentialValue,
        credentialMetadata: context.credentialMetadata,
        ...(input.signal ? { signal: input.signal } : {}),
      });

      const verifiedWorkingModels = Array.isArray(context.credentialMetadata.verifiedWorkingModels)
        ? context.credentialMetadata.verifiedWorkingModels.filter((value): value is string => typeof value === "string")
        : [];
      const nextMetadata: ProviderCredentialMetadata = {
        ...context.credentialMetadata,
        runtimeSurface: this.runtimeSurface,
        runtimeStatus: "working",
        lastRuntimeError: null,
        lastRuntimeSuccessAt: nowIso(),
        verifiedWorkingModels: [...new Set([...verifiedWorkingModels, selectedModel.label])],
      };
      await updateConnectionMetadata({
        connectionStore: this.connectionStore,
        connection: context.connection,
        metadata: nextMetadata,
      });
      await persistProviderHealth(this.providerRepository, context.provider.id, "healthy", response.durationMs, null);
      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: "test_message_success",
        occurredAt: nowIso(),
        data: {
          runtimeSurface: this.runtimeSurface,
          authMethod: resolveClaudeAuthMethod(context.credentialMetadata),
          requestedModel: selectedModel.requestedModel,
          selectedLabel: selectedModel.label,
          runtimeModel: selectedModel.runtimeModel,
          catalogModelKey: selectedModel.catalogModelKey,
          durationMs: response.durationMs,
          usage: sanitizeAuditValue(response.usage ?? null),
          rawResponse: summarizeRawResponse(response.rawResponse ?? null),
          prompt: summarizeText(input.message),
          response: summarizeText(response.content),
        },
      });
      return {
        ok: true,
        providerId: context.provider.id,
        model: selectedModel.label,
        requestedModel: selectedModel.requestedModel,
        runtimeModel: selectedModel.runtimeModel,
        catalogModelKey: selectedModel.catalogModelKey,
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
      const nextStatus = isClaudeReconnectError(message) ? "error" : context.connection.status;
      await updateConnectionMetadata({
        connectionStore: this.connectionStore,
        connection: context.connection,
        metadata: {
          ...context.credentialMetadata,
          runtimeSurface: this.runtimeSurface,
          runtimeStatus: "failed",
          lastRuntimeError: message,
          lastRuntimeFailureAt: nowIso(),
        },
        ...(nextStatus !== context.connection.status ? { status: nextStatus } : {}),
      });
      await persistProviderHealth(this.providerRepository, context.provider.id, "down", null, message);
      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: resolveClaudeFailureAuditPhase(errorCode),
        occurredAt: nowIso(),
        data: {
          runtimeSurface: this.runtimeSurface,
          authMethod: resolveClaudeAuthMethod(context.credentialMetadata),
          errorCode,
          requestedModel: selectedModel.requestedModel,
          selectedLabel: selectedModel.label,
          runtimeModel: selectedModel.runtimeModel,
          catalogModelKey: selectedModel.catalogModelKey,
          prompt: summarizeText(input.message),
          error: sanitizeAuditValue(message),
        },
      });
      if (isClaudeReconnectError(message)) {
        throw new ProviderConnectionReconnectRequiredError(context.connection.id, "error");
      }
      if (error instanceof AppError) throw error;
      throw new BadGatewayError(message, "claude_test_message_failed");
    }
  }
}

export class DisconnectClaudeUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
  ) {}

  async execute() {
    const provider = await ensureDefaultClaudeProvider(this.providerRepository);
    const connection = await this.connectionStore.findDefaultByProviderId(provider.id);
    if (!connection) {
      return {
        disconnected: false,
        providerId: provider.id,
      };
    }
    await this.connectionStore.deleteById(connection.id);
    return {
      disconnected: true,
      providerId: provider.id,
    };
  }
}
