import { GatewayTimeoutError } from "../../core/errors.js";
import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderConnectionResult,
  ProviderUsage,
} from "../../shared/provider-runtime/provider-adapter.js";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

type CodexInputItem = {
  role: "developer" | "user" | "assistant";
  content: Array<{ type: "input_text"; text: string }>;
};

type ParsedSseEvent = {
  eventName: string | null;
  data: string;
  json: Record<string, unknown> | null;
};

function resolveBaseUrl(context: ProviderAdapterContext) {
  return context.baseUrl?.trim() || CODEX_RESPONSES_URL;
}

function getWorkspaceId(context: ProviderAdapterContext) {
  const value = context.credentialMetadata?.chatgptAccountId ?? context.credentialMetadata?.workspaceId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildHeaders(context: ProviderAdapterContext) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream, application/json",
    originator: "codex_cli_rs",
    session_id: context.providerId,
  };

  if (context.credentialValue) {
    headers.authorization = `Bearer ${context.credentialValue}`;
  }

  const workspaceId = getWorkspaceId(context);
  if (workspaceId) {
    headers["chatgpt-account-id"] = workspaceId;
  }

  return headers;
}

function toCodexInput(messages: ProviderChatCompletionRequest["messages"]): CodexInputItem[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role === "system" ? "developer" : message.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: message.content }],
    }));
}

function normalizeUsage(usage: unknown): ProviderUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const inputTokens = typeof record.input_tokens === "number" ? record.input_tokens : 0;
  const outputTokens = typeof record.output_tokens === "number" ? record.output_tokens : 0;
  const totalTokens = typeof record.total_tokens === "number" ? record.total_tokens : inputTokens + outputTokens;
  const inputDetails = record.input_tokens_details;
  const cachedInputTokens = inputDetails && typeof inputDetails === "object" && typeof (inputDetails as Record<string, unknown>).cached_tokens === "number"
    ? (inputDetails as Record<string, number>).cached_tokens
    : 0;
  return { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens, cachedInputTokens };
}

function readTextPart(part: unknown): string {
  if (!part || typeof part !== "object") return "";
  const record = part as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.output_text === "string") return record.output_text;
  const nestedText = record.text && typeof record.text === "object" ? (record.text as Record<string, unknown>).value : undefined;
  return typeof nestedText === "string" ? nestedText : "";
}

function extractContent(responseBody: Record<string, unknown>): string {
  if (typeof responseBody.output_text === "string" && responseBody.output_text.trim()) {
    return responseBody.output_text;
  }

  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      const text = readTextPart(part);
      if (text) chunks.push(text);
    }
  }

  return chunks.join("\n").trim();
}

function extractChoices(content: string) {
  return [{ index: 0, finish_reason: "stop", message: { role: "assistant" as const, content } }];
}

function sanitizePreview(value: string, maxLength = 300) {
  return value
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._\-~+/]+=*/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9._\-]{20,}\b/g, "[redacted_jwt]")
    .replace(/\b[A-Za-z0-9+/_=-]{40,}\b/g, "[redacted_long_value]")
    .slice(0, maxLength);
}

function detectResponseShape(input: {
  contentType: string | null;
  responseText: string;
  parsed: Record<string, unknown> | null;
}) {
  if (!input.responseText.trim()) return "empty";
  if ((input.contentType || "").includes("text/event-stream")) return "event_stream";
  if (/^\s*(event:|data:)/m.test(input.responseText)) return "event_stream";
  if (input.parsed) return "json";
  return "text";
}

function buildRequestBody(request: ProviderChatCompletionRequest) {
  return {
    model: request.model,
    stream: true,
    store: false,
    input: toCodexInput(request.messages),
  };
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\r?\n/);
  const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? null;
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  if (!data) return null;

  let json: Record<string, unknown> | null = null;
  if (data !== "[DONE]") {
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      json = null;
    }
  }

  return { eventName, data, json };
}

function isTerminalSseEvent(event: ParsedSseEvent) {
  const type = typeof event.json?.type === "string" ? event.json.type : null;
  return event.data === "[DONE]"
    || event.eventName === "response.completed"
    || event.eventName === "response.failed"
    || type === "response.completed"
    || type === "response.failed";
}

async function readResponseAsText(response: Response) {
  if (!response.body) {
    return { responseText: await response.text(), parsedEvents: [] as ParsedSseEvent[] };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let responseText = "";
  let pending = "";
  const parsedEvents: ParsedSseEvent[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    responseText += chunk;
    pending += chunk;

    const parts = pending.split(/\r?\n\r?\n/);
    pending = parts.pop() ?? "";

    for (const part of parts) {
      const parsedEvent = parseSseBlock(part);
      if (parsedEvent) parsedEvents.push(parsedEvent);
    }
  }

  const tail = decoder.decode();
  if (tail) {
    responseText += tail;
    pending += tail;
  }

  const finalEvent = parseSseBlock(pending);
  if (finalEvent) parsedEvents.push(finalEvent);

  return { responseText, parsedEvents };
}

function parseEventStreamPayload(parsedEvents: ParsedSseEvent[]) {
  const chunks: string[] = [];
  let completedPayload: Record<string, unknown> | null = null;
  let lastJsonPayload: Record<string, unknown> | null = null;
  const eventTypes = new Set<string>();

  for (const event of parsedEvents) {
    if (event.eventName) eventTypes.add(event.eventName);
    if (typeof event.json?.type === "string" && event.json.type.trim()) {
      eventTypes.add(event.json.type);
    }

    if (event.data === "[DONE]" || !event.json) continue;

    lastJsonPayload = event.json;

    if (event.json.type === "response.output_text.delta" && typeof event.json.delta === "string") {
      chunks.push(event.json.delta);
    }

    const extractedChunk = extractContent(event.json);
    if (extractedChunk) chunks.push(extractedChunk);

    if (event.json.type === "response.completed" && event.json.response && typeof event.json.response === "object") {
      completedPayload = event.json.response as Record<string, unknown>;
    }
  }

  const terminalEventSeen = parsedEvents.some(isTerminalSseEvent);

  if (completedPayload) {
    if (chunks.length > 0 && typeof completedPayload.output_text !== "string") {
      completedPayload.output_text = chunks.join("");
    }
    return {
      payload: completedPayload,
      eventTypes: [...eventTypes],
      eventCount: parsedEvents.length,
      terminalEventSeen,
    };
  }

  if (lastJsonPayload) {
    if (chunks.length > 0 && typeof lastJsonPayload.output_text !== "string") {
      lastJsonPayload.output_text = chunks.join("");
    }
    return {
      payload: lastJsonPayload,
      eventTypes: [...eventTypes],
      eventCount: parsedEvents.length,
      terminalEventSeen,
    };
  }

  if (chunks.length > 0) {
    return {
      payload: { output_text: chunks.join("") } satisfies Record<string, unknown>,
      eventTypes: [...eventTypes],
      eventCount: parsedEvents.length,
      terminalEventSeen,
    };
  }

  return {
    payload: null,
    eventTypes: [...eventTypes],
    eventCount: parsedEvents.length,
    terminalEventSeen,
  };
}

export class CodexSubscriptionAdapter implements ProviderAdapter {
  readonly providerType = "codex_subscription";

  async chatCompletion(
    request: ProviderChatCompletionRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderChatCompletionResponse> {
    const controller = new AbortController();
    const timeoutMs = context.timeoutMs ?? 45_000;
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(resolveBaseUrl(context), {
        method: "POST",
        headers: buildHeaders(context),
        body: JSON.stringify(buildRequestBody(request)),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;
      const { responseText, parsedEvents } = await readResponseAsText(response);
      const isEventStream = (response.headers.get("content-type") || "").includes("text/event-stream")
        || parsedEvents.length > 0
        || /^\s*(event:|data:)/m.test(responseText);
      let parsed: Record<string, unknown> | null = null;

      let sseSummary:
        | {
          eventTypes: string[];
          eventCount: number;
          terminalEventSeen: boolean;
        }
        | undefined;

      if (isEventStream) {
        const parsedEventStream = parseEventStreamPayload(parsedEvents);
        parsed = parsedEventStream.payload;
        sseSummary = {
          eventTypes: parsedEventStream.eventTypes,
          eventCount: parsedEventStream.eventCount,
          terminalEventSeen: parsedEventStream.terminalEventSeen,
        };
      } else {
        try {
          parsed = responseText ? JSON.parse(responseText) as Record<string, unknown> : null;
        } catch {
          parsed = null;
        }
      }

      if (!response.ok) {
        const errorObject = parsed?.error && typeof parsed.error === "object" ? parsed.error as Record<string, unknown> : null;
        const message = typeof errorObject?.message === "string"
          ? errorObject.message
          : responseText || `Provider responded with HTTP ${response.status}`;

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

      const content = parsed ? extractContent(parsed) : "";
      const usage = normalizeUsage(parsed?.usage);
      const model = parsed && typeof parsed.model === "string" ? parsed.model : request.model;
      const contentType = response.headers.get("content-type");
      const responseShape = detectResponseShape({ contentType, responseText, parsed });
      const responseTopLevelKeys = parsed ? Object.keys(parsed).slice(0, 25) : [];
      const rawBodyPreview = sanitizePreview(responseText);

      return {
        ok: true,
        status: "success",
        model,
        content,
        ...(usage ? { usage } : {}),
        durationMs,
        providerRequestId: response.headers.get("x-request-id") ?? null,
        rawResponse: {
          ...(parsed ? { id: parsed.id, object: parsed.object, created_at: parsed.created_at } : {}),
          contentType,
          statusCode: response.status,
          responseShape,
          responseTopLevelKeys,
          rawBodyPreview,
          ...(isEventStream ? {
            sseEventTypes: sseSummary?.eventTypes ?? [],
            sseEventCount: sseSummary?.eventCount ?? 0,
            sseTerminalEventSeen: sseSummary?.terminalEventSeen ?? false,
          } : {}),
        },
        choices: extractChoices(content),
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
    const controller = new AbortController();
    const timeoutMs = context.timeoutMs ?? 15_000;
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(CODEX_USAGE_URL, {
        method: "GET",
        headers: buildHeaders(context),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;
      return {
        ok: response.ok,
        status: response.ok ? "healthy" : "degraded",
        latencyMs,
        message: response.ok ? "Codex subscription reachable" : `HTTP ${response.status}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, status: "down", latencyMs: Date.now() - startedAt, message: "Connection timeout" };
      }
      return {
        ok: false,
        status: "down",
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
