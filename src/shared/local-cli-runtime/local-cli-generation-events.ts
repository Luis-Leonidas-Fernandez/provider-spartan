import type { LocalCliRuntimeError, ProviderExecutionRecord, UnifiedGenerationEvent, UnifiedGenerationRequest } from "./local-cli-runtime.types.js";

export function createUnavailableUsageEvent(): UnifiedGenerationEvent {
  return { type: "usage", usageSource: "unavailable" };
}

export function collectFinalTextGenerationEvents(input: {
  request: UnifiedGenerationRequest;
  text: string;
  error?: LocalCliRuntimeError | undefined;
}): UnifiedGenerationEvent[] {
  if (input.error) {
    return [
      { type: "response.created", requestId: input.request.requestId },
      { type: "response.failed", error: input.error },
    ];
  }
  return [
    { type: "response.created", requestId: input.request.requestId },
    { type: "content.delta", text: input.text },
    createUnavailableUsageEvent(),
    { type: "response.completed" },
  ];
}

export function createProviderExecutionRecord(input: {
  request: UnifiedGenerationRequest;
  startedAt: string;
  durationMs: number;
  status: ProviderExecutionRecord["status"];
  error?: LocalCliRuntimeError | undefined;
}): ProviderExecutionRecord {
  return {
    requestId: input.request.requestId,
    provider: input.request.provider,
    runtime: input.request.runtime,
    model: input.request.model,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    status: input.status,
    ...(input.error ? { errorCode: input.error.code } : {}),
    usageSource: "unavailable",
  };
}
