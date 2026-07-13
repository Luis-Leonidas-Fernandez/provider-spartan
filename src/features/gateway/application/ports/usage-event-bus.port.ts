export type UsageBusEvent = {
  type: "request.started" | "provider.resolved" | "usage.estimated" | "usage.final" | "request.completed" | "request.failed" | "provider.health_changed";
  data: Record<string, unknown>;
};

export interface UsageEventBusPort {
  emit(event: UsageBusEvent): void;
  subscribe(listener: (event: UsageBusEvent) => void): () => void;
}
