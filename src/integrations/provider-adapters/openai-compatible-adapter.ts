import { GatewayTimeoutError } from "../../core/errors.js";
import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderConnectionResult,
  ProviderUsage,
} from "../../shared/provider-runtime/provider-adapter.js";

function normalizeUsage(usage: unknown): ProviderUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const promptTokens = typeof record.prompt_tokens === "number" ? record.prompt_tokens : 0;
  const completionTokens = typeof record.completion_tokens === "number" ? record.completion_tokens : 0;
  const totalTokens = typeof record.total_tokens === "number" ? record.total_tokens : promptTokens + completionTokens;
  const cachedInputTokens = typeof record.cached_input_tokens === "number" ? record.cached_input_tokens : 0;
  return { promptTokens, completionTokens, totalTokens, cachedInputTokens };
}

function ensureBaseUrl(context: ProviderAdapterContext): string {
  if (!context.baseUrl) {
    throw new Error(`Provider ${context.providerName} has no baseUrl configured`);
  }
  return context.baseUrl;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly providerType: string = "custom_openai_compatible";

  async chatCompletion(
    request: ProviderChatCompletionRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderChatCompletionResponse> {
    const baseUrl = ensureBaseUrl(context);
    if (request.stream) {
      return {
        ok: false,
        status: "failed",
        model: request.model,
        content: "",
        durationMs: 0,
        error: "Streaming passthrough to provider is not implemented yet; use stream=false",
      };
    }

    const controller = new AbortController();
    const timeoutMs = context.timeoutMs ?? 30_000;
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (context.credentialValue) {
        headers.authorization = `Bearer ${context.credentialValue}`;
      }

      const response = await fetch(new URL("/chat/completions", baseUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;
      const responseText = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = responseText ? JSON.parse(responseText) as Record<string, unknown> : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const message = parsed && typeof parsed.error === "object" && parsed.error && typeof (parsed.error as Record<string, unknown>).message === "string"
          ? String((parsed.error as Record<string, unknown>).message)
          : `Provider responded with HTTP ${response.status}`;
        return {
          ok: false,
          status: "failed",
          model: request.model,
          content: "",
          durationMs,
          providerRequestId: response.headers.get("x-request-id") ?? null,
          error: message,
          rawResponse: { status: response.status },
        };
      }

      const choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
      const firstChoice = choices[0] as Record<string, unknown> | undefined;
      const messageObj = firstChoice?.message as Record<string, unknown> | undefined;
      const content = typeof messageObj?.content === "string" ? messageObj.content : "";
      const normalizedChoices = choices.map((choice, index) => {
        const item = choice as Record<string, unknown>;
        const itemMessage = item.message as Record<string, unknown> | undefined;
        return {
          index: typeof item.index === "number" ? item.index : index,
          finish_reason: typeof item.finish_reason === "string" ? item.finish_reason : null,
          message: {
            role: "assistant" as const,
            content: typeof itemMessage?.content === "string" ? itemMessage.content : "",
          },
        };
      });
      const normalizedUsage = normalizeUsage(parsed?.usage);

      return {
        ok: true,
        status: "success",
        model: typeof parsed?.model === "string" ? parsed.model : request.model,
        content,
        ...(normalizedUsage ? { usage: normalizedUsage } : {}),
        durationMs,
        providerRequestId: response.headers.get("x-request-id") ?? null,
        ...(parsed ? { rawResponse: { id: parsed.id, object: parsed.object, created: parsed.created } } : {}),
        choices: normalizedChoices,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new GatewayTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(context: ProviderAdapterContext): Promise<ProviderConnectionResult> {
    const baseUrl = ensureBaseUrl(context);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs ?? 10_000);

    try {
      const headers: Record<string, string> = {};
      if (context.credentialValue) {
        headers.authorization = `Bearer ${context.credentialValue}`;
      }
      const response = await fetch(baseUrl, { method: "GET", headers, signal: controller.signal });
      const latencyMs = Date.now() - startedAt;
      return {
        ok: response.ok,
        status: response.ok ? "healthy" : "degraded",
        latencyMs,
        message: response.ok ? "Connection successful" : `HTTP ${response.status}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, status: "down", latencyMs: Date.now() - startedAt, message: "Connection timeout" };
      }
      return { ok: false, status: "down", latencyMs: Date.now() - startedAt, message: error instanceof Error ? error.message : "Connection failed" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
