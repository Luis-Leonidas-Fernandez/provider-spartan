import { AppError } from "../../../core/errors.js";
import { nowIso } from "../../../shared/date/date.js";
import { createId } from "../../../shared/id/id.js";
import { usageSources, usageStatuses } from "./usage-source.js";
import type { UsageEvent } from "./usage.types.js";

export function createUsageEvent(input: Omit<UsageEvent, "id" | "createdAt">): UsageEvent {
  if (!input.requestId.trim()) throw new AppError("requestId is required");
  for (const value of [input.inputTokens, input.outputTokens, input.cachedInputTokens, input.totalTokens, input.durationMs]) {
    if (value < 0) throw new AppError("Usage metrics must be non-negative");
  }
  if (!usageSources.includes(input.usageSource)) throw new AppError("Invalid usageSource");
  if (!usageStatuses.includes(input.status)) throw new AppError("Invalid usage status");
  if (input.pricingSnapshotJson) JSON.parse(input.pricingSnapshotJson);
  return {
    ...input,
    id: createId(),
    createdAt: nowIso(),
  };
}
