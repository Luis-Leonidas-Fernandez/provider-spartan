import { AppError } from "../../../core/errors.js";
import { nowIso } from "../../../shared/date/date.js";
import { createId } from "../../../shared/id/id.js";
import type { AppSubscription, SubscriptionPlan, AppSubscriptionStatus } from "./subscription.types.js";

export function createSubscriptionPlan(input: Omit<SubscriptionPlan, "id" | "createdAt" | "updatedAt">): SubscriptionPlan {
  if (!input.name.trim()) throw new AppError("Subscription plan name is required");
  const timestamp = nowIso();
  return { ...input, id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function updateSubscriptionPlan(entity: SubscriptionPlan, input: Partial<Omit<SubscriptionPlan, "id" | "createdAt" | "updatedAt">>) {
  return { ...entity, ...input, updatedAt: nowIso() };
}

export function createAppSubscription(input: Omit<AppSubscription, "id" | "createdAt" | "updatedAt">): AppSubscription {
  if (input.endsAt && input.endsAt < input.startsAt) throw new AppError("endsAt cannot be earlier than startsAt");
  const timestamp = nowIso();
  return { ...input, id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function updateAppSubscription(entity: AppSubscription, input: Partial<Omit<AppSubscription, "id" | "createdAt" | "updatedAt">>) {
  const status = input.status ?? entity.status;
  if (input.endsAt && input.endsAt < (input.startsAt ?? entity.startsAt)) throw new AppError("endsAt cannot be earlier than startsAt");
  return { ...entity, ...input, status: status as AppSubscriptionStatus, updatedAt: nowIso() };
}
