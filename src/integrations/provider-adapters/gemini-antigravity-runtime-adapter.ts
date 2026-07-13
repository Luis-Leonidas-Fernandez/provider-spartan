import { BadGatewayError, GatewayTimeoutError } from "../../core/errors.js";
import { createId } from "../../shared/id/id.js";
import { nowIso } from "../../shared/date/date.js";
import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderConnectionResult,
} from "../../shared/provider-runtime/provider-adapter.js";
import { DEFAULT_ANTIGRAVITY_CLI_BIN, DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS, type GeminiCliRunner } from "./gemini-runtime.js";
import { NodeAntigravityCliRunner } from "../antigravity-cli/antigravity-cli-runner.js";
import { AntigravityCliLocator } from "../antigravity-cli/antigravity-cli-locator.js";
import { describeAntigravityModelLabel } from "./antigravity-model-descriptor.js";
import { classifyLocalCliFailure, toLocalCliRuntimeFailure } from "../../shared/local-cli-runtime/local-cli-errors.js";
import { collectFinalTextGenerationEvents, createProviderExecutionRecord } from "../../shared/local-cli-runtime/local-cli-generation-events.js";

function composePrompt(request: ProviderChatCompletionRequest) {
  const system = request.messages
    .filter((message) => message.role === "system" && message.content.trim())
    .map((message) => message.content.trim())
    .join("\n\n");
  const conversation = request.messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .join("\n");
  return [system ? `Sistema:\n${system}` : null, conversation].filter(Boolean).join("\n\n");
}

function normalizeAntigravityModel(model: string) {
  const value = model.toLowerCase().trim();
  if (value === "pro" || value === "flash" || value === "flash_lite" || value === "flash-lite") {
    return value === "flash-lite" ? "flash_lite" : value;
  }
  return describeAntigravityModelLabel(model).runtimeModel;
}

function cliErrorMessage(error: unknown) {
  const record = error as { code?: unknown; message?: unknown };
  if (record?.code === "ENOENT") return "Antigravity CLI is not available. Install Antigravity or set ANTIGRAVITY_CLI_BIN.";
  return typeof record?.message === "string" ? record.message : "Antigravity CLI failed";
}

export class GeminiAntigravityRuntimeAdapter implements ProviderAdapter {
  readonly providerType = "gemini";
  private readonly runner: GeminiCliRunner;
  private readonly cliBin: string;
  private readonly timeoutMs: number;

  constructor(options?: { cliBin?: string; timeoutMs?: number; runner?: GeminiCliRunner }) {
    this.cliBin = options?.cliBin?.trim() || DEFAULT_ANTIGRAVITY_CLI_BIN;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS;
    this.runner = options?.runner ?? new NodeAntigravityCliRunner(new AntigravityCliLocator({
      explicitBinaryName: this.cliBin,
      ...(this.cliBin.includes("/") || this.cliBin.includes("\\") ? { explicitPath: this.cliBin } : {}),
    }));
  }

  async testConnection(context: ProviderAdapterContext): Promise<ProviderConnectionResult> {
    const startedAt = Date.now();
    try {
      const result = await this.runner.run([
        "--model",
        "flash",
        "--print",
        "Respondé solo: conectado",
      ], {
        timeoutMs: context.timeoutMs ?? this.timeoutMs,
        ...(context.signal ? { signal: context.signal } : {}),
      });
      const latencyMs = Date.now() - startedAt;
      if (result.exitCode !== 0) {
        const message = result.stderr.trim() || result.stdout.trim() || `Antigravity CLI exited with code ${result.exitCode}`;
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
        message: `Antigravity CLI reachable (${this.cliBin})`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = cliErrorMessage(error);
      return { ok: false, status: "down", latencyMs, message, rawResponse: { normalizedError: classifyLocalCliFailure(message) } };
    }
  }

  async chatCompletion(
    request: ProviderChatCompletionRequest,
    context: ProviderAdapterContext,
  ): Promise<ProviderChatCompletionResponse> {
    const startedAtMs = Date.now();
    const startedAt = nowIso();
    const requestId = createId();
    const antigravityModel = normalizeAntigravityModel(request.model);
    const args = ["--model", antigravityModel, "--print", composePrompt(request)];

    try {
      const result = await this.runner.run(args, {
        timeoutMs: context.timeoutMs ?? this.timeoutMs,
        ...(context.signal ? { signal: context.signal } : {}),
      });
      const durationMs = Date.now() - startedAtMs;
      if (result.exitCode !== 0) {
        const message = result.stderr.trim() || result.stdout.trim() || `Antigravity CLI exited with code ${result.exitCode}`;
        const normalizedError = classifyLocalCliFailure(message);
        throw new BadGatewayError(
          message,
          normalizedError.code.toLowerCase(),
        );
      }

      const content = result.stdout.trim();
      const generationRequest = {
        requestId,
        provider: "gemini",
        runtime: "antigravity",
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
      return {
        ok: true,
        status: "success",
        model: request.model,
        content,
        rawResponse: {
          runtimeSurface: "antigravity",
          cliBin: this.cliBin,
          antigravityModel,
          exitCode: result.exitCode,
          stderrLength: result.stderr.length,
          stdoutLength: result.stdout.length,
          outputFormat: "text",
          generationEvents,
          executionRecord,
          usageSource: "unavailable",
        },
        durationMs,
        providerRequestId: null,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      };
    } catch (error) {
      const runtimeError = toLocalCliRuntimeFailure(error);
      if (runtimeError.code === "PROCESS_TIMEOUT") {
        throw new GatewayTimeoutError(runtimeError.message);
      }
      if (error instanceof BadGatewayError) throw error;
      throw new BadGatewayError(runtimeError.message, runtimeError.code.toLowerCase());
    }
  }
}
