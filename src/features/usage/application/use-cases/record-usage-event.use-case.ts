import { createUsageEvent } from "../../domain/usage-event.entity.js";
import type { UsageEventRepositoryPort } from "../ports/usage-event-repository.port.js";
import type { UsageEvent } from "../../domain/usage.types.js";

export class RecordUsageEventUseCase {
  constructor(private readonly repository: UsageEventRepositoryPort) {}

  async execute(input: Omit<UsageEvent, "id" | "createdAt">) {
    const event = createUsageEvent(input);
    await this.repository.create(event);
    return event;
  }
}
