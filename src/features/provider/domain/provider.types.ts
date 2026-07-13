export type ProviderType = "openai" | "minimax" | "kimi" | "gemini" | "claude" | "cursor" | "local_qwen" | "custom_openai_compatible" | "codex_subscription" | "other";
export type AccessMode = "api_key" | "token_plan" | "oauth" | "local" | "manual" | "custom";
export type ProviderHealthStatus = "unknown" | "healthy" | "degraded" | "down";

export type ProviderPricing = {
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  outputPricePerMillion: number;
};

export type Provider = {
  id: string;
  name: string;
  providerType: ProviderType;
  accessMode: AccessMode;
  baseUrl: string | null;
  defaultModel: string | null;
  isEnabled: boolean;
  isDefault: boolean;
  supportsUsageReporting: boolean;
  supportsStreaming: boolean;
  pricingJson: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderHealth = {
  providerId: string;
  status: ProviderHealthStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  latencyMs: number | null;
};
