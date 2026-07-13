import type { AppClientRepositoryPort } from "../../../app-client/application/ports/app-client-repository.port.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { UsageEventRepositoryPort } from "../ports/usage-event-repository.port.js";
import type { UsageEvent } from "../../domain/usage.types.js";

function sum(events: UsageEvent[], selector: (event: UsageEvent) => number) {
  return events.reduce((acc, event) => acc + selector(event), 0);
}

export class GetUsageOverviewUseCase {
  constructor(
    private readonly repository: UsageEventRepositoryPort,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly appClientRepository: AppClientRepositoryPort,
  ) {}

  async execute() {
    const [events, providers, appClients] = await Promise.all([
      this.repository.findAll(),
      this.providerRepository.findAll(),
      this.appClientRepository.findAll(),
    ]);

    const providerCounts = new Map<string, number>();
    const modelCounts = new Map<string, number>();
    const appCounts = new Map<string, number>();
    let lastError: string | null = null;

    for (const event of events) {
      providerCounts.set(event.providerId, (providerCounts.get(event.providerId) ?? 0) + 1);
      modelCounts.set(event.modelName, (modelCounts.get(event.modelName) ?? 0) + 1);
      appCounts.set(event.appClientId, (appCounts.get(event.appClientId) ?? 0) + 1);
      if (event.errorMessage) lastError = event.errorMessage;
    }

    const mostUsedProviderId = [...providerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const mostActiveAppId = [...appCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const mostUsedModel = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      totalRequests: events.length,
      successfulRequests: events.filter((event) => event.status === "success").length,
      failedRequests: events.filter((event) => event.status !== "success").length,
      totalInputTokens: sum(events, (event) => event.inputTokens),
      totalOutputTokens: sum(events, (event) => event.outputTokens),
      totalCachedInputTokens: sum(events, (event) => event.cachedInputTokens),
      totalTokens: sum(events, (event) => event.totalTokens),
      totalEstimatedCostUsd: Number(sum(events, (event) => event.estimatedCostUsd ?? 0).toFixed(8)),
      totalDurationMs: sum(events, (event) => event.durationMs),
      averageLatencyMs: events.length ? Math.round(sum(events, (event) => event.durationMs) / events.length) : 0,
      mostUsedProvider: providers.find((provider) => provider.id === mostUsedProviderId)?.name ?? null,
      mostUsedModel,
      mostActiveApp: appClients.find((client) => client.id === mostActiveAppId)?.name ?? null,
      lastError,
    };
  }
}
