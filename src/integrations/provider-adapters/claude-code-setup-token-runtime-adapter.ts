import { BadGatewayError, GatewayTimeoutError } from "../../core/errors.js";
import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderConnectionResult,
  ProviderUsage,
} from "../../shared/provider-runtime/provider-adapter.js";
import { NodeClaudeCliRunner } from "./claude-cli-runner.js";
import {
  DEFAULT_CLAUDE_CLI_BIN,
  DEFAULT_CLAUDE_CLI_TIMEOUT_MS,
  type ClaudeCliRunner,
} from "./claude-runtime.js";
import { sanitizeClaudeSubscriptionEnvironment } from "../claude-cli/claude-environment-sanitizer.js";
import { classifyLocalCliFailure, toLocalCliRuntimeFailure } from "../../shared/local-cli-runtime/local-cli-errors.js";
import { collectFinalTextGenerationEvents, createProviderExecutionRecord } from "../../shared/local-cli-runtime/local-cli-generation-events.js";
import { createId } from "../../shared/id/id.js";
import { nowIso } from "../../shared/date/date.js";

function composePrompt(request: ProviderChatCompletionRequest) {
  const system = request.messages
    .filter((message) => message.role === "system" && message.content.trim())
    .map((message) => message.content.trim())
    .join("\n\n");
  const conversation = request.messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .join("\n");
  return [system ? `System:\n${system}` : null, conversation].filter(Boolean).join("\n\n");
}

function normalizeClaudeModel(model: string) {
  const value = model.trim().toLowerCase();
  if (!value) return "sonnet";
  if (value === "claude-sonnet" || value === "claude-sonnet-4-6") return "sonnet";
  if (value === "claude-opus" || value === "claude-opus-4-6") return "opus";
  return value;
}

function cliErrorMessage(error: unknown) {
  const record = error as { code?: unknown; message?: unknown };
  if (record?.code === "ENOENT") return "Claude CLI is not available. Install Claude Code or set CLAUDE_CLI_BIN.";
  return typeof record?.message === "string" ? record.message : "Claude CLI failed";
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractText(item);
      if (candidate) return candidate;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["result", "content", "text", "completion", "response"]) {
    const candidate = extractText(record[key]);
    if (candidate) return candidate;
  }
  for (const nested of Object.values(record)) {
    const candidate = extractText(nested);
    if (candidate) return candidate;
  }
  return "";
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJsonLines(stdout: string) {
  const events: unknown[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsed = tryParseJson(line);
    if (parsed !== null) events.push(parsed);
  }
  return events;
}

function extractEventTypes(events: unknown[]) {
  return events.flatMap((event) => {
    if (!event || typeof event !== "object") return [];
    const record = event as Record<string, unknown>;
    const candidates = [record.type, record.event, record.kind];
    return candidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  });
}

function extractIncrementalText(events: unknown[]) {
  const deltas = events.flatMap((event) => {
    if (!event || typeof event !== "object") return [];
    const record = event as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : typeof record.event === "string" ? record.event : null;
    if (type !== "content.delta") return [];
    const text = extractText(record);
    return text ? [text] : [];
  });
  return deltas.join("");
}

function extractUsage(value: unknown): ProviderUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const usageRecord = (record.usage && typeof record.usage === "object" && !Array.isArray(record.usage))
    ? record.usage as Record<string, unknown>
    : record;
  const promptTokens = typeof usageRecord.input_tokens === "number"
    ? usageRecord.input_tokens
    : typeof usageRecord.promptTokens === "number"
      ? usageRecord.promptTokens
      : undefined;
  const completionTokens = typeof usageRecord.output_tokens === "number"
    ? usageRecord.output_tokens
    : typeof usageRecord.completionTokens === "number"
      ? usageRecord.completionTokens
      : undefined;
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  const totalTokens = typeof usageRecord.total_tokens === "number"
    ? usageRecord.total_tokens
    : typeof usageRecord.totalTokens === "number"
      ? usageRecord.totalTokens
      : (promptTokens ?? 0) + (completionTokens ?? 0);
  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens,
    cachedInputTokens: typeof usageRecord.cached_input_tokens === "number"
      ? usageRecord.cached_input_tokens
      : typeof usageRecord.cachedInputTokens === "number"
        ? usageRecord.cachedInputTokens
        : 0,
  };
}

function parseClaudeCliOutput(stdout: string) {
  const directJson = tryParseJson(stdout);
  if (directJson !== null) {
    return {
      parsed: directJson,
      content: extractText(directJson) || stdout.trim(),
      usage: extractUsage(directJson),
      eventTypes: extractEventTypes([directJson]),
    };
  }

  const jsonEvents = parseJsonLines(stdout);
  if (jsonEvents.length > 0) {
    const incrementalText = extractIncrementalText(jsonEvents).trim();
    const text = incrementalText || jsonEvents
      .map((event) => extractText(event))
      .filter(Boolean)
      .join("\n")
      .trim();
    const usage = [...jsonEvents].reverse().map((event) => extractUsage(event)).find((value) => value !== undefined);
    return {
      parsed: jsonEvents,
      content: text || stdout.trim(),
      usage,
      eventTypes: extractEventTypes(jsonEvents),
    };
  }

  return {
    parsed: null,
    content: stdout.trim(),
    usage: undefined,
    eventTypes: [] as string[],
  };
}

function buildEnv(accessToken: string | null) {
  return sanitizeClaudeSubscriptionEnvironment(
    process.env,
    accessToken
      ? {
        CLAUDE_CODE_OAUTH_TOKEN: accessToken,
      }
      : {},
  ).childEnv;
}

export class ClaudeCodeSetupTokenRuntimeAdapter implements ProviderAdapter {
  readonly providerType = "claude";
  private readonly runner: ClaudeCliRunner;
  private readonly cliBin: string;
  private readonly timeoutMs: number;

  constructor(options?: { cliBin?: string; timeoutMs?: number; runner?: ClaudeCliRunner }) {
    this.cliBin = options?.cliBin?.trim() || DEFAULT_CLAUDE_CLI_BIN;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_CLAUDE_CLI_TIMEOUT_MS;
    this.runner = options?.runner ?? new NodeClaudeCliRunner(this.cliBin);
  }

  async testConnection(context: ProviderAdapterContext): Promise<ProviderConnectionResult> {
    const startedAt = Date.now();
    try {
      const result = await this.runner.run([
        "-p",
        "--output-format",
        "json",
        "--model",
        "sonnet",
        "Respond with only: connected",
      ], {
        timeoutMs: context.timeoutMs ?? this.timeoutMs,
        env: buildEnv(context.credentialValue),
      });
      const latencyMs = Date.now() - startedAt;
      if (result.exitCode !== 0) {
        const message = result.stderr.trim() || result.stdout.trim() || `Claude CLI exited with code ${result.exitCode}`;
        const normalizedError = classifyLocalCliFailure(message);
        return {
          ok: false,
          status: "down",
          latencyMs,
          message,
          rawResponse: { normalizedError },
        };
      }
      return {
        ok: true,
        status: "healthy",
        latencyMs,
        message: `Claude CLI reachable (${this.cliBin})`,
      };
    } catch (error) {
      const message = cliErrorMessage(error);
      return {
        ok: false,
        status: "down",
        latencyMs: Date.now() - startedAt,
        message,
        rawResponse: { normalizedError: classifyLocalCliFailure(message) },
      };
    }
  }

  async chatCompletion(
    request: ProviderChatCompletionRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderChatCompletionResponse> {
    const startedAtMs = Date.now();
    const startedAt = nowIso();
    const requestId = createId();
    const normalizedModel = normalizeClaudeModel(request.model);
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      normalizedModel,
      composePrompt(request),
    ];

    try {
      const result = await this.runner.run(args, {
        timeoutMs: context.timeoutMs ?? this.timeoutMs,
        env: buildEnv(context.credentialValue),
        ...(context.signal ? { signal: context.signal } : {}),
      });
      const durationMs = Date.now() - startedAtMs;
      if (result.exitCode !== 0) {
        const message = result.stderr.trim() || result.stdout.trim() || `Claude CLI exited with code ${result.exitCode}`;
        const normalizedError = classifyLocalCliFailure(message);
        throw new BadGatewayError(
          message,
          normalizedError.code.toLowerCase(),
        );
      }

      const parsedOutput = parseClaudeCliOutput(result.stdout);
      const content = parsedOutput.content;
      const usage = parsedOutput.usage;
      const generationRequest = {
        requestId,
        provider: "claude",
        runtime: "claude_code_cli",
        model: request.model,
        prompt: composePrompt(request),
      };
      const generationEvents = collectFinalTextGenerationEvents({ request: generationRequest, text: content });
      const executionRecord = createProviderExecutionRecord({
        request: generationRequest,
        startedAt,
        durationMs,
        status: "success",
      });
      const rawResponse = {
        parsedShape: Array.isArray(parsedOutput.parsed) ? "event_stream" : parsedOutput.parsed ? "json" : "text",
        outputFormat: "json",
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        eventTypes: parsedOutput.eventTypes,
        generationEvents,
        executionRecord: {
          ...executionRecord,
          usageSource: usage ? "exact" : executionRecord.usageSource,
          ...(usage ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens } : {}),
        },
      };

      return {
        ok: true,
        status: "success",
        model: request.model,
        content,
        ...(usage ? { usage } : {}),
        rawResponse,
        durationMs,
        providerRequestId: null,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      };
    } catch (error) {
      const runtimeError = toLocalCliRuntimeFailure(error);
      if (runtimeError.code === "PROCESS_TIMEOUT") throw new GatewayTimeoutError(runtimeError.message);
      if (error instanceof BadGatewayError) throw error;
      throw new BadGatewayError(runtimeError.message, runtimeError.code.toLowerCase());
    }
  }
}
