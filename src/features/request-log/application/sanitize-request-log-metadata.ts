export function sanitizeErrorMessage(message: string | null | undefined) {
  if (!message) return null;
  return message.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, "Bearer [REDACTED]");
}

export function buildRequestMetadata(input: {
  model: string;
  provider: string;
  appClientId: string;
  messageCount: number;
  requestSizeApprox: number;
  usageSource: string;
}) {
  return {
    model: input.model,
    provider: input.provider,
    appClientId: input.appClientId,
    messageCount: input.messageCount,
    requestSizeApprox: input.requestSizeApprox,
    usageSource: input.usageSource,
  };
}

export function buildResponseMetadata(input: {
  providerRequestId?: string | null | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
  totalTokens?: number | undefined;
  responseSizeApprox: number;
  status: string;
}) {
  return {
    ...(input.providerRequestId !== undefined ? { providerRequestId: input.providerRequestId } : {}),
    tokenCounts: {
      input: input.inputTokens ?? 0,
      output: input.outputTokens ?? 0,
      cachedInput: input.cachedInputTokens ?? 0,
      total: input.totalTokens ?? 0,
    },
    responseSizeApprox: input.responseSizeApprox,
    status: input.status,
  };
}
