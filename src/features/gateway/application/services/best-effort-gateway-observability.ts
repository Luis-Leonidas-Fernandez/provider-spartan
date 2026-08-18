import type {
  UsageBusEvent,
  UsageEventBusPort,
} from "../ports/usage-event-bus.port.js";

export function emitGatewayEventBestEffort(
  eventBus: UsageEventBusPort,
  event: UsageBusEvent,
) {
  try {
    eventBus.emit(event);
  } catch {
    // Observability must never change the provider operation result.
  }
}

export async function runGatewayObservabilityBestEffort(
  tasks: ReadonlyArray<() => Promise<unknown>>,
) {
  await Promise.allSettled(tasks.map(async (task) => await task()));
}
