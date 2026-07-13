export const usageSources = ["provider_reported", "estimated", "reconciled"] as const;
export type UsageSource = (typeof usageSources)[number];

export const usageStatuses = ["success", "failed", "timeout", "cancelled"] as const;
export type UsageStatus = (typeof usageStatuses)[number];
