export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string | undefined;
};

export type ProviderChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number | undefined;
  max_tokens?: number | undefined;
  stream?: boolean | undefined;
};

export type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedInputTokens?: number | undefined;
};

export type ProviderAdapterContext = {
  providerId: string;
  providerType: string;
  providerName: string;
  baseUrl: string | null;
  credentialValue: string | null;
  credentialMetadata?: Record<string, unknown> | undefined;
  timeoutMs?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
};

export type ProviderConnectionResult = {
  ok: boolean;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  message: string;
  rawResponse?: unknown;
};

export type ProviderChatCompletionResponse = {
  ok: boolean;
  status: "success" | "failed" | "timeout";
  model: string;
  content: string;
  usage?: ProviderUsage | undefined;
  rawResponse?: unknown;
  durationMs: number;
  providerRequestId?: string | null | undefined;
  error?: string | undefined;
  choices?: Array<{ index: number; finish_reason: string | null; message: { role: "assistant"; content: string } }> | undefined;
};

export interface ProviderAdapter {
  providerType: string;
  chatCompletion(
    request: ProviderChatCompletionRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderChatCompletionResponse>;
  testConnection(context: ProviderAdapterContext): Promise<ProviderConnectionResult>;
}
