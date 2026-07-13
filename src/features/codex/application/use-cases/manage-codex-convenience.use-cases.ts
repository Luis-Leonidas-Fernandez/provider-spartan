import { createHash } from "node:crypto";
import { AppError, BadGatewayError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { Provider } from "../../../provider/domain/provider.types.js";
import type { ProviderAdapterRegistryPort } from "../../../gateway/application/ports/provider-adapter-registry.port.js";
import { DEFAULT_CODEX_MODEL, normalizeCodexModel, resolveRecommendedCodexModel } from "../../../../shared/provider-models/codex-models.js";
import type { CodexRequestAuditRecorderPort } from "../ports/codex-request-audit-recorder.port.js";
import type { CodexAccountModelDiscovery, CodexAccountModelDiscoveryReaderPort } from "../ports/codex-account-model-discovery-reader.port.js";
import type { ProviderConnection, ValidProviderCredential } from "../../../../provider-auth/core/provider-auth.types.js";
import { getConnectionStatusMessage, getConnectionStatusReason, shouldReconnectForStatus } from "../../../../provider-auth/core/provider-auth.utils.js";
import { ProviderConnectionNotConnectedError } from "../../../../provider-auth/core/provider-auth.errors.js";
import { PER_CONNECTION_IDENTITY_MODEL } from "../../../../shared/local-cli-runtime/local-cli-runtime.types.js";

function parseCredentialMetadata(metadataJson: string | null | undefined): Record<string, unknown> | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function findDefaultCodexProvider(providers: Provider[]) {
  return providers.find((provider) =>
    provider.providerType === "codex_subscription"
    && provider.accessMode === "oauth"
    && provider.isEnabled,
  ) ?? null;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseConnectionMetadata(connection: ProviderConnection | null) {
  return parseCredentialMetadata(connection?.metadataJson);
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

function summarizeSseResponse(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== "object") return null;
  const record = rawResponse as Record<string, unknown>;
  const eventTypes = Array.isArray(record.sseEventTypes)
    ? record.sseEventTypes.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const eventCount = typeof record.sseEventCount === "number" ? record.sseEventCount : 0;
  const contentType = typeof record.contentType === "string" ? record.contentType : null;
  const terminalEventSeen = typeof record.sseTerminalEventSeen === "boolean" ? record.sseTerminalEventSeen : null;
  if (eventTypes.length === 0 && eventCount === 0 && !contentType && terminalEventSeen === null) return null;
  return { eventTypes, eventCount, contentType, terminalEventSeen };
}

function summarizeProviderResponse(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== "object") return null;
  const record = rawResponse as Record<string, unknown>;
  const responseContentType = typeof record.contentType === "string" ? record.contentType : null;
  const responseStatusCode = typeof record.statusCode === "number" ? record.statusCode : null;
  const responseShape = typeof record.responseShape === "string" ? record.responseShape : null;
  const responseTopLevelKeys = Array.isArray(record.responseTopLevelKeys)
    ? record.responseTopLevelKeys.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const rawBodyPreview = typeof record.rawBodyPreview === "string" && record.rawBodyPreview.trim().length > 0
    ? record.rawBodyPreview
    : null;
  const sseEventSummary = summarizeSseResponse(rawResponse);

  if (!responseContentType && responseStatusCode === null && !responseShape && responseTopLevelKeys.length === 0 && !rawBodyPreview && !sseEventSummary) {
    return null;
  }

  return {
    responseContentType,
    responseStatusCode,
    responseShape,
    responseTopLevelKeys,
    rawBodyPreview,
    sseEventSummary,
  };
}

function resolveEffectiveCodexModel(input: {
  requestedModel?: string | null | undefined;
  providerDefaultModel?: string | null | undefined;
  accountModelDiscovery: CodexAccountModelDiscovery | null;
}) {
  const recommendedModel = resolveRecommendedCodexModel(
    input.accountModelDiscovery,
    input.providerDefaultModel,
  );

  const requestedModel = input.requestedModel?.trim() ?? null;
  return {
    requestedModel,
    recommendedModel,
    effectiveModel: normalizeCodexModel(requestedModel, {
      accountModelDiscovery: input.accountModelDiscovery,
      providerDefaultModel: input.providerDefaultModel,
    }),
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value)))];
}

function toCodexAvailableModels(input: {
  accountModelDiscovery: CodexAccountModelDiscovery | null;
  providerDefaultModel?: string | null | undefined;
  recommendedModel: string;
}) {
  const discoveredModels = uniqueStrings([
    ...(input.accountModelDiscovery?.codexMiniModels ?? []),
    ...(input.accountModelDiscovery?.accountAvailableModels ?? []),
  ]);
  const models = discoveredModels.length > 0
    ? uniqueStrings([...discoveredModels, input.recommendedModel])
    : uniqueStrings([input.recommendedModel, input.providerDefaultModel, DEFAULT_CODEX_MODEL]);

  return models.map((model) => ({
    label: model,
    runtimeModel: normalizeCodexModel(model, {
      accountModelDiscovery: input.accountModelDiscovery,
      providerDefaultModel: input.providerDefaultModel,
    }),
    catalogModelKey: model,
    family: "codex",
    quality: model === input.recommendedModel ? "recommended" : "available",
    source: input.accountModelDiscovery ? "account_discovery" : "static_fallback",
  }));
}

async function resolveConnectedCodexContext(input: {
  providerRepository: ProviderRepositoryPort;
  getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>;
  getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>;
}) {
  const providers = await input.providerRepository.findAll();
  const provider = findDefaultCodexProvider(providers);
  if (!provider) throw new ProviderConnectionNotConnectedError("codex");
  const connection = await input.getDefaultProviderAuthStatus({
    provider: "codex",
    providerId: provider.id,
  });
  if (!connection) throw new ProviderConnectionNotConnectedError("codex");
  const validCredential = await input.getValidProviderCredential(connection.id);

  return {
    provider,
    connection,
    credentialValue: validCredential.accessToken ?? "",
    credentialMetadata: validCredential.metadata ?? parseConnectionMetadata(connection),
  };
}

export class GetCodexStatusUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly accountModelDiscoveryReader: CodexAccountModelDiscoveryReaderPort,
  ) {}

  async execute() {
    const accountModelDiscovery = await this.accountModelDiscoveryReader.readLatest();
    const providers = await this.providerRepository.findAll();
    const provider = findDefaultCodexProvider(providers);
    if (!provider) {
      const recommendedCodexModel = resolveRecommendedCodexModel(accountModelDiscovery, null);
      return {
        connected: false,
        reconnectRequired: true,
        reason: "not_connected",
        message: "Provider is not connected",
        provider: "codex-subscription",
        providerType: "codex_subscription",
        authMethod: "oauth_token",
        runtimeSurface: "codex_subscription",
        identityModel: PER_CONNECTION_IDENTITY_MODEL,
        defaultModel: DEFAULT_CODEX_MODEL,
        recommendedCodexModel,
        providerId: null,
        loginStatus: "unknown",
        refreshTokenExists: false,
        tokenExpiresAt: null,
        lastRefreshAt: null,
        accountEmail: null,
        chatgptAccountId: null,
        chatgptPlanType: null,
        accountModelDiscovery,
        health: null,
      };
    }

    const connection = await this.getDefaultProviderAuthStatus({
      provider: "codex",
      providerId: provider.id,
    });
    const metadata = parseConnectionMetadata(connection);
    const health = await this.providerRepository.getHealth(provider.id);
    const lifecycle = presentConnectionLifecycle(connection);

    return {
      connected: lifecycle.connected,
      reconnectRequired: lifecycle.reconnectRequired,
      reason: lifecycle.reason,
      message: lifecycle.message,
      provider: "codex-subscription",
      providerType: "codex_subscription",
      authMethod: "oauth_token",
      runtimeSurface: "codex_subscription",
      identityModel: PER_CONNECTION_IDENTITY_MODEL,
      defaultModel: safeString(provider.defaultModel) ?? DEFAULT_CODEX_MODEL,
      recommendedCodexModel: resolveRecommendedCodexModel(accountModelDiscovery, provider.defaultModel),
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
      chatgptAccountId: safeString(metadata?.chatgptAccountId),
      chatgptPlanType: safeString(metadata?.chatgptPlanType),
      accountModelDiscovery,
      health,
    };
  }
}

export class ListCodexModelsUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly accountModelDiscoveryReader: CodexAccountModelDiscoveryReaderPort,
  ) {}

  async execute() {
    const accountModelDiscovery = await this.accountModelDiscoveryReader.readLatest();
    const providers = await this.providerRepository.findAll();
    const provider = findDefaultCodexProvider(providers);
    const connection = provider
      ? await this.getDefaultProviderAuthStatus({ provider: "codex", providerId: provider.id })
      : null;
    const recommendedModel = resolveRecommendedCodexModel(accountModelDiscovery, provider?.defaultModel ?? null);
    const availableModels = toCodexAvailableModels({
      accountModelDiscovery,
      providerDefaultModel: provider?.defaultModel ?? null,
      recommendedModel,
    });

    return {
      provider: "codex-subscription",
      providerId: provider?.id ?? null,
      connected: connection?.status === "connected",
      runtimeSurface: "codex_subscription",
      discoverySource: accountModelDiscovery ? accountModelDiscovery.discoverySource : "codex_static_fallback",
      accountModelDiscovery,
      availableModels,
      knownModels: availableModels.map((model) => model.label),
      knownModelKeys: availableModels.map((model) => model.catalogModelKey),
      recommendedModel,
      recommendedLabels: {
        quality: recommendedModel,
      },
      notes: accountModelDiscovery
        ? "Available models are based on the latest authenticated ChatGPT/Codex account discovery snapshot."
        : "No account discovery snapshot is available; returning static Codex fallback recommendations.",
    };
  }
}

export class TestCodexConnectionUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
  ) {}

  async execute() {
    const context = await resolveConnectedCodexContext({
      providerRepository: this.providerRepository,
      getDefaultProviderAuthStatus: this.getDefaultProviderAuthStatus,
      getValidProviderCredential: this.getValidProviderCredential,
    });

    const adapter = this.adapterRegistry.getAdapter(context.provider.providerType);
    return adapter.testConnection({
      providerId: context.provider.id,
      providerType: context.provider.providerType,
      providerName: context.provider.name,
      baseUrl: context.provider.baseUrl,
      credentialValue: context.credentialValue,
      ...(context.credentialMetadata ? { credentialMetadata: context.credentialMetadata } : {}),
    });
  }
}

export class SendCodexTestMessageUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly auditRecorder: CodexRequestAuditRecorderPort,
    private readonly accountModelDiscoveryReader: CodexAccountModelDiscoveryReaderPort,
  ) {}

  async execute(input: { message: string; system?: string | null; model?: string | null; maxTokens?: number | null }) {
    const context = await resolveConnectedCodexContext({
      providerRepository: this.providerRepository,
      getDefaultProviderAuthStatus: this.getDefaultProviderAuthStatus,
      getValidProviderCredential: this.getValidProviderCredential,
    });

    const adapter = this.adapterRegistry.getAdapter(context.provider.providerType);
    const accountModelDiscovery = await this.accountModelDiscoveryReader.readLatest();
    const system = input.system?.trim() ? input.system.trim() : null;
    const modelResolution = resolveEffectiveCodexModel({
      requestedModel: input.model,
      providerDefaultModel: context.provider.defaultModel,
      accountModelDiscovery,
    });
    const requestedModel = modelResolution.requestedModel ?? context.provider.defaultModel ?? null;
    const model = modelResolution.effectiveModel;
    const request = {
      model,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: input.message },
      ],
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    };

    let auditRecorded = false;
    try {
      const response = await adapter.chatCompletion(request, {
        providerId: context.provider.id,
        providerType: context.provider.providerType,
        providerName: context.provider.name,
        baseUrl: context.provider.baseUrl,
        credentialValue: context.credentialValue,
        ...(context.credentialMetadata ? { credentialMetadata: context.credentialMetadata } : {}),
      });

      await this.auditRecorder.record({
        providerId: context.provider.id,
        phase: response.ok ? "test_message_success" : "test_message_failed",
        occurredAt: nowIso(),
        data: {
          model: response.model,
          defaultModel: safeString(context.provider.defaultModel) ?? DEFAULT_CODEX_MODEL,
          recommendedCodexModel: modelResolution.recommendedModel,
          requestedModel: requestedModel || null,
          normalizedModel: model,
          accountModelDiscovery,
          responseObservability: summarizeProviderResponse(response.rawResponse),
          status: response.status,
          latencyMs: response.durationMs,
          providerRequestId: response.providerRequestId ?? null,
          usage: response.usage ?? null,
          error: response.error ?? null,
          promptDiagnostics: summarizePrompt(input.message, system),
          responseDiagnostics: summarizeResponse(response.content),
        },
      });
      auditRecorded = true;

      if (!response.ok) {
        throw new BadGatewayError(response.error ?? "Codex test message failed", "codex_test_message_failed");
      }

      return {
        ok: true,
        providerId: context.provider.id,
        model: response.model,
        requestedModel: requestedModel || null,
        runtimeModel: model,
        catalogModelKey: model,
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
      if (!(error instanceof ProviderConnectionNotConnectedError) && !(error instanceof AppError && error.code === "provider_connection_not_connected") && !auditRecorded) {
        await this.auditRecorder.record({
          providerId: context.provider.id,
          phase: "test_message_failed",
          occurredAt: nowIso(),
          data: {
            model,
            defaultModel: safeString(context.provider.defaultModel) ?? DEFAULT_CODEX_MODEL,
            recommendedCodexModel: modelResolution.recommendedModel,
            requestedModel: requestedModel || null,
            normalizedModel: model,
            accountModelDiscovery,
            status: "failed",
            latencyMs: null,
            providerRequestId: null,
            usage: null,
            error: error instanceof Error ? error.message : "Codex test message failed",
            promptDiagnostics: summarizePrompt(input.message, system),
          },
        });
      }
      throw error;
    }
  }
}
