import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { UsageEventRepositoryPort } from "../ports/usage-event-repository.port.js";

function summarize(events: Awaited<ReturnType<UsageEventRepositoryPort["findAll"]>>) {
  const modelsUsed = [...new Set(events.map((event) => event.modelName))];
  const lastUsedAt = events.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? null;
  const lastError = events.slice().reverse().find((event) => event.errorMessage)?.errorMessage ?? null;
  return {
    requestsTotal: events.length,
    requestsSuccess: events.filter((event) => event.status === "success").length,
    requestsFailed: events.filter((event) => event.status !== "success").length,
    inputTokensTotal: events.reduce((acc, event) => acc + event.inputTokens, 0),
    outputTokensTotal: events.reduce((acc, event) => acc + event.outputTokens, 0),
    cachedInputTokensTotal: events.reduce((acc, event) => acc + event.cachedInputTokens, 0),
    totalTokens: events.reduce((acc, event) => acc + event.totalTokens, 0),
    estimatedCostUsd: Number(events.reduce((acc, event) => acc + (event.estimatedCostUsd ?? 0), 0).toFixed(8)),
    totalDurationMs: events.reduce((acc, event) => acc + event.durationMs, 0),
    averageLatencyMs: events.length ? Math.round(events.reduce((acc, event) => acc + event.durationMs, 0) / events.length) : 0,
    lastUsedAt,
    lastError,
    modelsUsed,
  };
}

export class GetUsageByProviderUseCase {
  constructor(
    private readonly repository: UsageEventRepositoryPort,
    private readonly providerRepository: ProviderRepositoryPort,
  ) {}

  async execute(providerId?: string) {
    const providers = await this.providerRepository.findAll();
    if (providerId) {
      const events = await this.repository.findByProviderId(providerId);
      const provider = providers.find((item) => item.id === providerId);
      return {
        providerId,
        providerName: provider?.name ?? providerId,
        ...summarize(events),
      };
    }

    const events = await this.repository.findAll();
    return providers.map((provider) => {
      const providerEvents = events.filter((event) => event.providerId === provider.id);
      return {
        providerId: provider.id,
        providerName: provider.name,
        ...summarize(providerEvents),
      };
    });
  }
}
