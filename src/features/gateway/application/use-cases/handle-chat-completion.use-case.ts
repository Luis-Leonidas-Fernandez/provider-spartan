import { BadGatewayError, NotFoundError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import type { AppClientRepositoryPort } from "../../../app-client/application/ports/app-client-repository.port.js";
import type { ValidateAppClientKeyUseCase } from "../../../app-client/application/use-cases/validate-app-client-key.use-case.js";
import type { EnsureFreshProviderCredentialUseCase } from "../../../credential/application/use-cases/manage-oauth-credential.use-cases.js";
import type { CredentialCipherService } from "../../../credential/infrastructure/credential-cipher.service.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import { createProviderHealth } from "../../../provider/domain/provider.entity.js";
import type { Provider } from "../../../provider/domain/provider.types.js";
import type { AppSubscriptionRepositoryPort } from "../../../subscription/application/ports/app-subscription-repository.port.js";
import { buildRequestMetadata, buildResponseMetadata, sanitizeErrorMessage } from "../../../request-log/application/sanitize-request-log-metadata.js";
import { createRequestLog } from "../../../request-log/domain/request-log.entity.js";
import { createUsageEvent } from "../../../usage/domain/usage-event.entity.js";
import type { UsageTrackerService } from "../../../usage/application/services/usage-tracker.service.js";
import { createId } from "../../../../shared/id/id.js";
import { DefaultProviderNotConfiguredError, ProviderCredentialMissingError, ProviderDisabledError, SubscriptionInactiveError } from "../../domain/gateway.errors.js";
import type { GatewayChatCompletionRequest } from "../../domain/gateway.types.js";
import type { ParseProviderModelUseCase } from "./parse-provider-model.use-case.js";
import type { ProviderAdapterRegistryPort } from "../ports/provider-adapter-registry.port.js";
import type { RequestLogRecorderPort } from "../ports/request-log-recorder.port.js";
import type { UsageEventBusPort } from "../ports/usage-event-bus.port.js";
import type { UsageRecorderPort } from "../ports/usage-recorder.port.js";
import type { ProviderConnection, ValidProviderCredential } from "../../../../provider-auth/core/provider-auth.types.js";
import { resolveProviderRuntimeCredential } from "../services/resolve-provider-runtime-credential.js";

function parseCredentialMetadata(metadataJson: string | null | undefined): Record<string, unknown> | undefined {
  if (!metadataJson) return undefined;
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function subscriptionIsActive(subscription: { status: string; startsAt: string; endsAt: string | null }) {
  const now = Date.now();
  if (subscription.status !== "active") return false;
  if (Date.parse(subscription.startsAt) > now) return false;
  if (subscription.endsAt && Date.parse(subscription.endsAt) < now) return false;
  return true;
}

function providerRequiresCredential(provider: Provider) {
  if (
    provider.providerType === "claude"
    || provider.providerType === "gemini"
    || provider.providerType === "codex_subscription"
  ) {
    return true;
  }
  return provider.accessMode !== "local" && provider.accessMode !== "manual";
}

export class HandleChatCompletionUseCase {
  constructor(
    private readonly validateAppClientKey: ValidateAppClientKeyUseCase,
    private readonly appClientRepository: AppClientRepositoryPort,
    private readonly appSubscriptionRepository: AppSubscriptionRepositoryPort,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly ensureFreshProviderCredential: EnsureFreshProviderCredentialUseCase,
    private readonly credentialCipher: CredentialCipherService,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly parseProviderModel: ParseProviderModelUseCase,
    private readonly usageTracker: UsageTrackerService,
    private readonly usageRecorder: UsageRecorderPort,
    private readonly requestLogRecorder: RequestLogRecorderPort,
    private readonly usageEventBus: UsageEventBusPort,
    private readonly getDefaultProviderConnectionByProviderId?: (providerId: string) => Promise<ProviderConnection | null>,
    private readonly getDefaultProviderAuthStatus?: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>,
    private readonly getValidProviderCredential?: (connectionId: string) => Promise<ValidProviderCredential>,
  ) {}

  async execute(input: {
    authorizationHeader: string | undefined;
    clientRequestId?: string;
    body: GatewayChatCompletionRequest;
    signal?: AbortSignal;
  }) {
    const startedAt = Date.now();
    const requestId = input.clientRequestId?.trim() || createId();
    const token = input.authorizationHeader?.startsWith("Bearer ") ? input.authorizationHeader.slice("Bearer ".length).trim() : "";
    const appClient = await this.validateAppClientKey.execute(token);
    await this.appClientRepository.touchLastUsedAt(appClient.id, nowIso());

    const subscriptions = await this.appSubscriptionRepository.findByAppClientId(appClient.id);
    const subscription = subscriptions.find(subscriptionIsActive);
    if (!subscription) throw new SubscriptionInactiveError();

    this.usageEventBus.emit({ type: "request.started", data: { requestId, appClientId: appClient.id, model: input.body.model } });

    const parsed = this.parseProviderModel.execute(input.body.model);
    const providerPrefix = parsed.providerPrefix;
    const provider = providerPrefix
      ? await (async () => {
          const providerType = mapPrefixToProviderType(providerPrefix);
          const providers = await this.providerRepository.findAll();
          return providers.find((candidate) => candidate.providerType === providerType && candidate.isEnabled) ?? null;
        })()
      : await this.providerRepository.findDefault();
    if (!provider) throw new DefaultProviderNotConfiguredError();
    if (!provider.isEnabled) throw new ProviderDisabledError();

    this.usageEventBus.emit({ type: "provider.resolved", data: { requestId, providerId: provider.id, providerType: provider.providerType, modelName: parsed.modelName } });

    const legacyCredential = await this.ensureFreshProviderCredential.execute(provider.id);
    const resolvedRuntimeCredential = await resolveProviderRuntimeCredential({
      provider,
      legacyCredential,
      credentialCipher: this.credentialCipher,
      getDefaultProviderConnectionByProviderId: this.getDefaultProviderConnectionByProviderId,
      getDefaultProviderAuthStatus: this.getDefaultProviderAuthStatus,
      getValidProviderCredential: this.getValidProviderCredential,
    });
    if (providerRequiresCredential(provider) && !resolvedRuntimeCredential) throw new ProviderCredentialMissingError();
    const credentialValue = resolvedRuntimeCredential?.credentialValue ?? null;
    const credentialMetadata = resolvedRuntimeCredential?.credentialMetadata ?? parseCredentialMetadata(legacyCredential?.metadataJson);
    const adapter = this.adapterRegistry.getAdapter(provider.providerType);

    try {
      const providerResponse = await adapter.chatCompletion({ ...input.body, model: parsed.modelName }, {
        providerId: provider.id,
        providerType: provider.providerType,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        credentialValue,
        credentialMetadata,
        ...(input.signal ? { signal: input.signal } : {}),
      });

      const usage = this.usageTracker.buildUsage(input.body, providerResponse);
      const estimatedCostUsd = this.usageTracker.calculateCost({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        pricingSnapshotJson: provider.pricingJson,
      });

      const usageEvent = createUsageEvent({
        requestId,
        appClientId: appClient.id,
        providerId: provider.id,
        modelName: providerResponse.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        totalTokens: usage.totalTokens,
        usageSource: usage.usageSource,
        estimatedCostUsd,
        finalCostUsd: null,
        pricingSnapshotJson: provider.pricingJson,
        durationMs: providerResponse.durationMs,
        status: providerResponse.status === "timeout" ? "timeout" : providerResponse.ok ? "success" : "failed",
        errorMessage: sanitizeErrorMessage(providerResponse.error),
      });
      await this.usageRecorder.record(usageEvent);

      const requestLog = createRequestLog({
        requestId,
        appClientId: appClient.id,
        providerId: provider.id,
        modelName: providerResponse.model,
        endpoint: "/v1/chat/completions",
        method: "POST",
        statusCode: providerResponse.ok ? 200 : 502,
        durationMs: providerResponse.durationMs,
        requestMetadataJson: JSON.stringify(buildRequestMetadata({
          model: input.body.model,
          provider: provider.providerType,
          appClientId: appClient.id,
          messageCount: input.body.messages.length,
          requestSizeApprox: JSON.stringify(input.body).length,
          usageSource: usage.usageSource,
        })),
        responseMetadataJson: JSON.stringify(buildResponseMetadata({
          providerRequestId: providerResponse.providerRequestId ?? null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          totalTokens: usage.totalTokens,
          responseSizeApprox: providerResponse.content.length,
          status: providerResponse.status,
        })),
        errorMessage: sanitizeErrorMessage(providerResponse.error),
      });
      await this.requestLogRecorder.record(requestLog);

      const healthBefore = await this.providerRepository.getHealth(provider.id);
      const nextHealth = {
        ...(healthBefore ?? createProviderHealth(provider.id)),
        status: providerResponse.ok ? "healthy" as const : "degraded" as const,
        lastCheckedAt: nowIso(),
        lastSuccessAt: providerResponse.ok ? nowIso() : (healthBefore?.lastSuccessAt ?? null),
        lastError: sanitizeErrorMessage(providerResponse.error),
        latencyMs: providerResponse.durationMs,
      };
      await this.providerRepository.upsertHealth(nextHealth);
      if (healthBefore?.status !== nextHealth.status) {
        this.usageEventBus.emit({ type: "provider.health_changed", data: { requestId, providerId: provider.id, status: nextHealth.status } });
      }

      this.usageEventBus.emit({
        type: usage.usageSource === "estimated" ? "usage.estimated" : "usage.final",
        data: { requestId, providerId: provider.id, usageSource: usage.usageSource, totalTokens: usage.totalTokens, estimatedCostUsd },
      });
      this.usageEventBus.emit({
        type: providerResponse.ok ? "request.completed" : "request.failed",
        data: { requestId, providerId: provider.id, durationMs: providerResponse.durationMs, status: providerResponse.status },
      });

      if (!providerResponse.ok) {
        throw new BadGatewayError(sanitizeErrorMessage(providerResponse.error) ?? "Provider request failed", "provider_request_failed");
      }

      return {
        id: requestId,
        object: "chat.completion",
        created: Math.floor(startedAt / 1000),
        model: providerResponse.model,
        choices: providerResponse.choices ?? [{ index: 0, finish_reason: providerResponse.ok ? "stop" : null, message: { role: "assistant", content: providerResponse.content } }],
        usage: {
          prompt_tokens: usage.inputTokens,
          completion_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens,
        },
      };
    } catch (error) {
      const sanitizedError = sanitizeErrorMessage(error instanceof Error ? error.message : "Provider request failed");
      const durationMs = Date.now() - startedAt;
      const usage = this.usageTracker.estimateUsage(input.body, 0);
      const usageEvent = createUsageEvent({
        requestId,
        appClientId: appClient.id,
        providerId: provider.id,
        modelName: parsed.modelName,
        inputTokens: usage.inputTokens,
        outputTokens: 0,
        cachedInputTokens: 0,
        totalTokens: usage.inputTokens,
        usageSource: "estimated",
        estimatedCostUsd: this.usageTracker.calculateCost({ inputTokens: usage.inputTokens, outputTokens: 0, cachedInputTokens: 0, pricingSnapshotJson: provider.pricingJson }),
        finalCostUsd: null,
        pricingSnapshotJson: provider.pricingJson,
        durationMs,
        status: error instanceof Error && error.name === "AppError" && (error as any).code === "gateway_timeout" ? "timeout" : "failed",
        errorMessage: sanitizedError,
      });
      await this.usageRecorder.record(usageEvent);
      const requestLog = createRequestLog({
        requestId,
        appClientId: appClient.id,
        providerId: provider.id,
        modelName: parsed.modelName,
        endpoint: "/v1/chat/completions",
        method: "POST",
        statusCode: 502,
        durationMs,
        requestMetadataJson: JSON.stringify(buildRequestMetadata({
          model: input.body.model,
          provider: provider.providerType,
          appClientId: appClient.id,
          messageCount: input.body.messages.length,
          requestSizeApprox: JSON.stringify(input.body).length,
          usageSource: "estimated",
        })),
        responseMetadataJson: JSON.stringify(buildResponseMetadata({ status: "failed", responseSizeApprox: 0 })),
        errorMessage: sanitizedError,
      });
      await this.requestLogRecorder.record(requestLog);
      const healthBefore = await this.providerRepository.getHealth(provider.id);
      const nextHealth = {
        ...(healthBefore ?? createProviderHealth(provider.id)),
        status: "down" as const,
        lastCheckedAt: nowIso(),
        lastError: sanitizedError,
        latencyMs: durationMs,
      };
      await this.providerRepository.upsertHealth(nextHealth);
      if (healthBefore?.status !== nextHealth.status) {
        this.usageEventBus.emit({ type: "provider.health_changed", data: { requestId, providerId: provider.id, status: nextHealth.status } });
      }
      this.usageEventBus.emit({ type: "request.failed", data: { requestId, providerId: provider.id, durationMs, error: sanitizedError } });
      throw error;
    }
  }
}

function mapPrefixToProviderType(prefix: string): Provider["providerType"] {
  switch (prefix) {
    case "openai":
      return "openai";
    case "minimax":
      return "minimax";
    case "kimi":
      return "kimi";
    case "local":
      return "local_qwen";
    case "codex":
      return "codex_subscription";
    case "gemini":
    case "antigravity":
      return "gemini";
    case "claude":
      return "claude";
    case "cursor":
      return "cursor";
    default:
      throw new NotFoundError(`Provider prefix ${prefix} is not supported`);
  }
}
