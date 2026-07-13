import type { UsageSource, UsageStatus } from "./usage-source.js";

export type UsageEvent = {
  id: string;
  requestId: string;
  appClientId: string;
  providerId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  usageSource: UsageSource;
  estimatedCostUsd: number | null;
  finalCostUsd: number | null;
  pricingSnapshotJson: string | null;
  durationMs: number;
  status: UsageStatus;
  errorMessage: string | null;
  createdAt: string;
};

export type CanonicalUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  usageSource: UsageSource;
};
