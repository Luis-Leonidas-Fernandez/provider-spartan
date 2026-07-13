import type { LocalCliRuntimeError, LocalCliRuntimeErrorCode } from "./local-cli-runtime.types.js";

export class LocalCliRuntimeFailure extends Error {
  constructor(
    readonly code: LocalCliRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalCliRuntimeFailure";
  }
}

export function createLocalCliRuntimeFailure(code: LocalCliRuntimeErrorCode, message: string) {
  return new LocalCliRuntimeFailure(code, message);
}

export function classifyLocalCliFailure(message: string): LocalCliRuntimeError {
  const normalized = message.toLowerCase();
  if (/not installed|enoent|cli_not_installed|not found/.test(normalized)) {
    return { code: "CLI_NOT_INSTALLED", message };
  }
  if (/auth required|authentication required|please login|please sign in|set an auth method|not authenticated/.test(normalized)) {
    return { code: "AUTH_REQUIRED", message };
  }
  if (/auth failed|authentication failed|invalid grant|unauthorized|access denied/.test(normalized)) {
    return { code: "AUTH_FAILED", message };
  }
  if (/model.*not.*available|unknown model|model.*not found|invalid model/.test(normalized)) {
    return { code: "MODEL_NOT_AVAILABLE", message };
  }
  if (/quota|credits are depleted|resource_exhausted|billing/.test(normalized)) {
    return { code: "QUOTA_EXHAUSTED", message };
  }
  if (/rate.?limit|too many requests|429/.test(normalized)) {
    return { code: "RATE_LIMITED", message };
  }
  if (/provider is busy|provider busy|all execution slots are busy|busy and queueing disabled/.test(normalized)) {
    return { code: "PROVIDER_BUSY", message };
  }
  if (/queue is full|queue full|execution queue full/.test(normalized)) {
    return { code: "QUEUE_FULL", message };
  }
  if (/timed out|timeout|etimedout/.test(normalized)) {
    return { code: "PROCESS_TIMEOUT", message };
  }
  if (/abort|cancel|client disconnected|disconnected/.test(normalized)) {
    return { code: "PROCESS_CANCELLED", message };
  }
  if (/invalid.*output|parse|malformed/.test(normalized)) {
    return { code: "INVALID_OUTPUT", message };
  }
  if (/crash|exited with code|signal/.test(normalized)) {
    return { code: "PROCESS_CRASHED", message };
  }
  return { code: "PROVIDER_UNAVAILABLE", message };
}

export function toLocalCliRuntimeFailure(error: unknown): LocalCliRuntimeFailure {
  if (error instanceof LocalCliRuntimeFailure) return error;
  const record = error as { code?: unknown; message?: unknown };
  if (record?.code === "ETIMEDOUT") {
    return new LocalCliRuntimeFailure("PROCESS_TIMEOUT", typeof record.message === "string" ? record.message : "Local CLI process timed out");
  }
  if (record?.code === "ABORT_ERR") {
    return new LocalCliRuntimeFailure("PROCESS_CANCELLED", typeof record.message === "string" ? record.message : "Local CLI process cancelled");
  }
  if (record?.code === "CLI_NOT_INSTALLED" || record?.code === "ENOENT") {
    return new LocalCliRuntimeFailure("CLI_NOT_INSTALLED", typeof record.message === "string" ? record.message : "Local CLI not installed");
  }
  if (record?.code === "PROVIDER_BUSY" || record?.code === "QUEUE_FULL" || record?.code === "PROCESS_CANCELLED") {
    return new LocalCliRuntimeFailure(
      record.code,
      typeof record.message === "string" ? record.message : "Local CLI execution failed",
    );
  }
  const message = typeof record?.message === "string" ? record.message : String(error ?? "Unknown local CLI error");
  const classified = classifyLocalCliFailure(message);
  return new LocalCliRuntimeFailure(classified.code, classified.message);
}
