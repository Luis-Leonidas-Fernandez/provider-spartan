import type { UsageEvent } from "../../../usage/domain/usage.types.js";

export interface UsageRecorderPort {
  record(event: UsageEvent): Promise<void>;
}
