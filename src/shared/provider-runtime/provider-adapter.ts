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
  imageGeneration?(
    request: ProviderImageGenerationRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderImageGenerationResponse>;
  imageGenerationCapabilities?: ProviderImageGenerationCapabilities | undefined;
  testConnection(context: ProviderAdapterContext): Promise<ProviderConnectionResult>;
}

export type ProviderImageGenerationCapabilities = {
  maxImages: number;
  supportsSize: boolean;
  supportsQuality: boolean;
  supportedResponseFormats: ReadonlyArray<"url" | "b64_json">;
};

export type ProviderImageGenerationRequest = {
  model: string;
  prompt: string;
  n?: number | undefined;
  size?: string | undefined;
  quality?: string | undefined;
  response_format?: "url" | "b64_json" | undefined;
};

export type ProviderImageGenerationData = {
  url?: string | undefined;
  b64_json?: string | undefined;
  revised_prompt?: string | undefined;
};

export type ProviderImageGenerationResponse = {
  ok: boolean;
  status: "success" | "failed" | "timeout";
  model: string;
  data: ProviderImageGenerationData[];
  durationMs: number;
  created?: number | undefined;
  providerRequestId?: string | null | undefined;
  usage?: ProviderUsage | undefined;
  error?: string | undefined;
  rawResponse?: unknown;
};
