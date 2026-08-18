import { AppError, BadGatewayError, NotFoundError } from "../../../../core/errors.js";
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
import { createId } from "../../../../shared/id/id.js";
import { DefaultProviderNotConfiguredError, ProviderCredentialMissingError, ProviderDisabledError, SubscriptionInactiveError } from "../../domain/gateway.errors.js";
import type { GatewayImageGenerationRequest } from "../../domain/gateway.types.js";
import type { ParseProviderModelUseCase } from "./parse-provider-model.use-case.js";
import type { ProviderAdapterRegistryPort } from "../ports/provider-adapter-registry.port.js";
import type { RequestLogRecorderPort } from "../ports/request-log-recorder.port.js";
import type { UsageEventBusPort } from "../ports/usage-event-bus.port.js";
import type { UsageRecorderPort } from "../ports/usage-recorder.port.js";
import type { ProviderConnection, ValidProviderCredential } from "../../../../provider-auth/core/provider-auth.types.js";
import { resolveProviderRuntimeCredential } from "../services/resolve-provider-runtime-credential.js";
import { validateImageGenerationCapabilities } from "../../domain/image-generation-capabilities.js";
import {
  emitGatewayEventBestEffort,
  runGatewayObservabilityBestEffort,
} from "../services/best-effort-gateway-observability.js";

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

export class HandleImageGenerationUseCase {
  constructor(
    private readonly validateAppClientKey: ValidateAppClientKeyUseCase,
    private readonly appClientRepository: AppClientRepositoryPort,
    private readonly appSubscriptionRepository: AppSubscriptionRepositoryPort,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly ensureFreshProviderCredential: EnsureFreshProviderCredentialUseCase,
    private readonly credentialCipher: CredentialCipherService,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly parseProviderModel: ParseProviderModelUseCase,
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
    body: GatewayImageGenerationRequest;
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

    const parsed = this.parseProviderModel.execute(input.body.model);
    const provider = parsed.providerPrefix
      ? await (async () => {
          const providerType = mapPrefixToProviderType(parsed.providerPrefix!);
          const providers = await this.providerRepository.findAll();
          return providers.find((candidate) => candidate.providerType === providerType && candidate.isEnabled) ?? null;
        })()
      : await this.providerRepository.findDefault();
    if (!provider) throw new DefaultProviderNotConfiguredError();
    if (!provider.isEnabled) throw new ProviderDisabledError();

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
    if (!adapter.imageGeneration) {
      throw new AppError(`Provider type ${provider.providerType} does not support image generation`, 501, "image_generation_not_supported");
    }
    if (!adapter.imageGenerationCapabilities) {
      throw new AppError(
        `Provider type ${provider.providerType} has no declared image generation capabilities`,
        500,
        "image_generation_capabilities_missing",
      );
    }
    const providerRequest = validateImageGenerationCapabilities(
      { ...input.body, model: parsed.modelName },
      adapter.imageGenerationCapabilities,
    );

    emitGatewayEventBestEffort(this.usageEventBus, {
      type: "request.started",
      data: { requestId, appClientId: appClient.id, providerId: provider.id, model: input.body.model },
    });

    let terminalEventEmitted = false;
    const emitTerminalEvent = (event: "request.completed" | "request.failed", data: Record<string, unknown>) => {
      if (terminalEventEmitted) return;
      terminalEventEmitted = true;
      emitGatewayEventBestEffort(this.usageEventBus, { type: event, data });
    };

    try {
      const providerResponse = await adapter.imageGeneration(providerRequest, {
        providerId: provider.id,
        providerType: provider.providerType,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        credentialValue,
        credentialMetadata,
        ...(input.signal ? { signal: input.signal } : {}),
      });

      const usage = providerResponse.usage;
      const usageSource = usage ? "provider_reported" as const : "unavailable" as const;
      const inputTokens = usage?.promptTokens ?? 0;
      const outputTokens = usage?.completionTokens ?? 0;
      const cachedInputTokens = usage?.cachedInputTokens ?? 0;
      const totalTokens = usage?.totalTokens ?? 0;
      const status = providerResponse.status === "timeout" ? "timeout" : providerResponse.ok ? "success" : "failed";
      await runGatewayObservabilityBestEffort([
        async () => await this.usageRecorder.record(createUsageEvent({
          requestId,
          appClientId: appClient.id,
          providerId: provider.id,
          modelName: providerResponse.model,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          totalTokens,
          usageSource,
          estimatedCostUsd: null,
          finalCostUsd: null,
          pricingSnapshotJson: provider.pricingJson,
          durationMs: providerResponse.durationMs,
          status,
          errorMessage: sanitizeErrorMessage(providerResponse.error),
        })),
        async () => await this.requestLogRecorder.record(createRequestLog({
          requestId,
          appClientId: appClient.id,
          providerId: provider.id,
          modelName: providerResponse.model,
          endpoint: "/v1/images/generations",
          method: "POST",
          statusCode: providerResponse.ok ? 200 : 502,
          durationMs: providerResponse.durationMs,
          requestMetadataJson: JSON.stringify(buildRequestMetadata({
            model: input.body.model,
            provider: provider.providerType,
            appClientId: appClient.id,
            messageCount: 1,
            requestSizeApprox: JSON.stringify(input.body).length,
            usageSource,
          })),
          responseMetadataJson: JSON.stringify(buildResponseMetadata({
            providerRequestId: providerResponse.providerRequestId ?? null,
            inputTokens,
            outputTokens,
            cachedInputTokens,
            totalTokens,
            usageAvailable: Boolean(usage),
            responseSizeApprox: JSON.stringify(providerResponse.data).length,
            status: providerResponse.status,
          })),
          errorMessage: sanitizeErrorMessage(providerResponse.error),
        })),
        async () => {
          const healthBefore = await this.providerRepository.getHealth(provider.id);
          await this.providerRepository.upsertHealth({
            ...(healthBefore ?? createProviderHealth(provider.id)),
            status: providerResponse.ok ? "healthy" as const : "degraded" as const,
            lastCheckedAt: nowIso(),
            lastSuccessAt: providerResponse.ok ? nowIso() : (healthBefore?.lastSuccessAt ?? null),
            lastError: sanitizeErrorMessage(providerResponse.error),
            latencyMs: providerResponse.durationMs,
          });
        },
      ]);

      if (!providerResponse.ok) {
        throw new BadGatewayError(sanitizeErrorMessage(providerResponse.error) ?? "Provider image generation failed", "provider_image_generation_failed");
      }

      emitTerminalEvent("request.completed", {
        requestId,
        providerId: provider.id,
        durationMs: providerResponse.durationMs,
        status: providerResponse.status,
      });

      return {
        created: providerResponse.created ?? Math.floor(startedAt / 1000),
        data: providerResponse.data,
      };
    } catch (error) {
      emitTerminalEvent("request.failed", {
        requestId,
        providerId: provider.id,
        durationMs: Date.now() - startedAt,
        error: sanitizeErrorMessage(error instanceof Error ? error.message : "Provider image generation failed"),
      });
      throw error;
    }
  }
}
