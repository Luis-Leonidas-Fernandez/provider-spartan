import { EventEmitter } from "node:events";
import type { UsageBusEvent, UsageEventBusPort } from "../application/ports/usage-event-bus.port.js";

export class SseUsageEventBus implements UsageEventBusPort {
  private readonly emitter = new EventEmitter();

  emit(event: UsageBusEvent) {
    this.emitter.emit("usage-event", event);
  }

  subscribe(listener: (event: UsageBusEvent) => void) {
    this.emitter.on("usage-event", listener);
    return () => this.emitter.off("usage-event", listener);
  }
}
