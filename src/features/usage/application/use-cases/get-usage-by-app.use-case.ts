import type { AppClientRepositoryPort } from "../../../app-client/application/ports/app-client-repository.port.js";
import type { UsageEventRepositoryPort } from "../ports/usage-event-repository.port.js";

export class GetUsageByAppUseCase {
  constructor(
    private readonly repository: UsageEventRepositoryPort,
    private readonly appClientRepository: AppClientRepositoryPort,
  ) {}

  async execute(appClientId?: string) {
    const [events, appClients] = await Promise.all([
      appClientId ? this.repository.findByAppClientId(appClientId) : this.repository.findAll(),
      this.appClientRepository.findAll(),
    ]);

    if (appClientId) {
      const client = appClients.find((item) => item.id === appClientId);
      return summarizeApp(appClientId, client?.name ?? appClientId, events);
    }

    return appClients.map((client) => summarizeApp(client.id, client.name, events.filter((event) => event.appClientId === client.id)));
  }
}

function summarizeApp(appClientId: string, appName: string, events: Awaited<ReturnType<UsageEventRepositoryPort["findAll"]>>) {
  return {
    appClientId,
    appName,
    requestsTotal: events.length,
    providersUsed: [...new Set(events.map((event) => event.providerId))],
    inputTokensTotal: events.reduce((acc, event) => acc + event.inputTokens, 0),
    outputTokensTotal: events.reduce((acc, event) => acc + event.outputTokens, 0),
    totalTokens: events.reduce((acc, event) => acc + event.totalTokens, 0),
    estimatedCostUsd: Number(events.reduce((acc, event) => acc + (event.estimatedCostUsd ?? 0), 0).toFixed(8)),
    totalDurationMs: events.reduce((acc, event) => acc + event.durationMs, 0),
    lastUsedAt: events.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? null,
  };
}
