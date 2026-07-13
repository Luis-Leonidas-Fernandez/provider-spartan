import type { UsageEventRepositoryPort } from "../ports/usage-event-repository.port.js";

export class GetUsageByModelUseCase {
  constructor(private readonly repository: UsageEventRepositoryPort) {}

  async execute() {
    const events = await this.repository.findAll();
    const models = [...new Set(events.map((event) => event.modelName))];
    return models.map((modelName) => {
      const modelEvents = events.filter((event) => event.modelName === modelName);
      return {
        modelName,
        requestsTotal: modelEvents.length,
        inputTokensTotal: modelEvents.reduce((acc, event) => acc + event.inputTokens, 0),
        outputTokensTotal: modelEvents.reduce((acc, event) => acc + event.outputTokens, 0),
        totalTokens: modelEvents.reduce((acc, event) => acc + event.totalTokens, 0),
        estimatedCostUsd: Number(modelEvents.reduce((acc, event) => acc + (event.estimatedCostUsd ?? 0), 0).toFixed(8)),
        lastUsedAt: modelEvents.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? null,
      };
    });
  }
}
