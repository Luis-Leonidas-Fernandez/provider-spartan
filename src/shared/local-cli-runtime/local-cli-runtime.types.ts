export type ProviderIdentityScope = "local_os_user" | "gateway_instance" | "per_connection";

export type ProviderIdentityModel = {
  scope: ProviderIdentityScope;
  sharedByAllClients: boolean;
  description: string;
};

export const LOCAL_OS_USER_IDENTITY_MODEL: ProviderIdentityModel = {
  scope: "local_os_user",
  sharedByAllClients: true,
  description: "All clients of this gateway instance use the local operating-system user session for this runtime.",
};

export const PER_CONNECTION_IDENTITY_MODEL: ProviderIdentityModel = {
  scope: "per_connection",
  sharedByAllClients: false,
  description: "Each provider connection carries its own account/session identity.",
};

export type LocalCliRuntimeErrorCode =
  | "CLI_NOT_INSTALLED"
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "MODEL_NOT_AVAILABLE"
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "PROVIDER_BUSY"
  | "QUEUE_FULL"
  | "PROCESS_TIMEOUT"
  | "PROCESS_CANCELLED"
  | "PROCESS_CRASHED"
  | "INVALID_OUTPUT"
  | "PROVIDER_UNAVAILABLE";

export type LocalCliRuntimeError = {
  code: LocalCliRuntimeErrorCode;
  message: string;
};

export type ProviderExecutionRecord = {
  requestId: string;
  provider: string;
  runtime: string;
  model: string;
  startedAt: string;
  durationMs: number;
  status: "success" | "error" | "cancelled";
  errorCode?: LocalCliRuntimeErrorCode;
  inputTokens?: number;
  outputTokens?: number;
  usageSource: "exact" | "estimated" | "unavailable";
};

export type UnifiedGenerationRequest = {
  requestId: string;
  provider: string;
  runtime: string;
  model: string;
  prompt: string;
};

export type UnifiedGenerationEvent =
  | { type: "response.created"; requestId: string }
  | { type: "content.delta"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; usageSource: "exact" | "estimated" | "unavailable" }
  | { type: "response.completed" }
  | { type: "response.failed"; error: LocalCliRuntimeError };
