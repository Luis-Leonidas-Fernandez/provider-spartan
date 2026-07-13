import type { UsageEventRepositoryPort } from "../ports/usage-event-repository.port.js";

export class ListUsageEventsUseCase {
  constructor(private readonly repository: UsageEventRepositoryPort) {}

  execute() {
    return this.repository.findAll();
  }
}
