import { BadGatewayError, GatewayTimeoutError } from "../../core/errors.js";
import { createId } from "../../shared/id/id.js";
import { nowIso } from "../../shared/date/date.js";
import { collectFinalTextGenerationEvents, createProviderExecutionRecord } from "../../shared/local-cli-runtime/local-cli-generation-events.js";
import { classifyLocalCliFailure, toLocalCliRuntimeFailure } from "../../shared/local-cli-runtime/local-cli-errors.js";
import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderConnectionResult,
} from "../../shared/provider-runtime/provider-adapter.js";
import type { CursorCliCapabilities, CursorCliCommandRunnerPort } from "../cursor-cli/cursor-cli.types.js";
import { sanitizeCursorSubscriptionEnvironment } from "../cursor-cli/cursor-environment-sanitizer.js";
import { CursorWorkspaceManager } from "../cursor-cli/cursor-workspace-manager.js";
import type { CursorModelCatalogPort } from "../cursor-cli/cursor-model-catalog.types.js";
import { resolveCursorRequestedModel } from "../cursor-cli/resolve-cursor-requested-model.js";

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

function cliErrorMessage(error: unknown) {
  const record = error as { code?: unknown; message?: unknown };
  if (record?.code === "ENOENT") return "Cursor CLI is not available. Install Cursor or set CURSOR_CLI_PATH.";
  return typeof record?.message === "string" ? record.message : "Cursor CLI failed";
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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
  for (const key of ["result", "content", "text", "completion", "response", "message"]) {
    const candidate = extractText(record[key]);
    if (candidate) return candidate;
  }
  for (const nested of Object.values(record)) {
    const candidate = extractText(nested);
    if (candidate) return candidate;
  }
  return "";
}

function parseCursorCliOutput(stdout: string) {
  const directJson = tryParseJson(stdout);
  if (directJson !== null) {
    return {
      parsed: directJson,
      content: extractText(directJson) || stdout.trim(),
    };
  }
  return {
    parsed: null,
    content: stdout.trim(),
  };
}

function buildEnv() {
  return sanitizeCursorSubscriptionEnvironment(process.env).childEnv;
}

function buildCursorArgs(input: {
  modelId: string;
  prompt: string;
  capabilities: CursorCliCapabilities | null;
}) {
  const args: string[] = [];
  const capabilities = input.capabilities;
  const supportsPrintFlag = capabilities?.detectedArguments.includes("--print") || capabilities?.detectedArguments.includes("-p");
  if (capabilities?.supportsModelArgument) {
    args.push("--model", input.modelId);
  }
  if (capabilities?.supportsJsonOutput) {
    args.push("--json");
  }
  if (supportsPrintFlag || capabilities?.supportsPrintMode) {
    args.push("--print", input.prompt);
    return {
      args,
      inputText: undefined,
      outputFormat: capabilities?.supportsJsonOutput ? "json" : "text",
    };
  }
  return {
    args,
    inputText: input.prompt,
    outputFormat: capabilities?.supportsJsonOutput ? "json" : "text",
  };
}

export class CursorCliRuntimeAdapter implements ProviderAdapter {
  readonly providerType = "cursor";

  constructor(
    private readonly runner: CursorCliCommandRunnerPort,
    private readonly statusInspector: { inspect(): Promise<{ capabilities: CursorCliCapabilities | null }> },
    private readonly modelCatalog: CursorModelCatalogPort,
    private readonly workspaceManager: CursorWorkspaceManager,
    private readonly timeoutMs: number,
  ) {}

  async testConnection(context: ProviderAdapterContext): Promise<ProviderConnectionResult> {
    const startedAt = Date.now();
    try {
      const status = await this.statusInspector.inspect();
      const reservation = await this.workspaceManager.reserveIsolatedWorkspace();
      try {
        const command = buildCursorArgs({
          modelId: "cursor-fast",
          prompt: "Respond with only: connected",
          capabilities: status.capabilities,
        });
        const result = await this.runner.run(command.args, {
          timeoutMs: context.timeoutMs ?? this.timeoutMs,
          ...(context.signal ? { signal: context.signal } : {}),
          ...(command.inputText ? { inputText: command.inputText } : {}),
          cwd: reservation.workspacePath,
          env: buildEnv(),
        });
        const latencyMs = Date.now() - startedAt;
        if (result.exitCode !== 0) {
          const message = result.stderr.trim() || result.stdout.trim() || `Cursor CLI exited with code ${result.exitCode}`;
          const normalizedError = classifyLocalCliFailure(message);
          return {
            ok: false,
            status: "down",
            latencyMs,
            message,
            rawResponse: { normalizedError, workspaceMode: "isolated" },
          };
        }
        return {
          ok: true,
          status: "healthy",
          latencyMs,
          message: "Cursor CLI reachable in isolated workspace",
        };
      } finally {
        await reservation.cleanup();
      }
    } catch (error) {
      const message = cliErrorMessage(error);
      return {
        ok: false,
        status: "down",
        latencyMs: Date.now() - startedAt,
        message,
        rawResponse: { normalizedError: classifyLocalCliFailure(message), workspaceMode: "isolated" },
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
    const prompt = composePrompt(request);
    const status = await this.statusInspector.inspect();
    const availableModels = await this.modelCatalog.listAvailableModels();
    const resolvedModel = resolveCursorRequestedModel({
      requestedModel: request.model,
      availableModels,
    });
    const command = buildCursorArgs({
      modelId: resolvedModel.selectedId,
      prompt,
      capabilities: status.capabilities,
    });
    const reservation = await this.workspaceManager.reserveIsolatedWorkspace();

    try {
      const result = await this.runner.run(command.args, {
        timeoutMs: context.timeoutMs ?? this.timeoutMs,
        ...(context.signal ? { signal: context.signal } : {}),
        ...(command.inputText ? { inputText: command.inputText } : {}),
        cwd: reservation.workspacePath,
        env: buildEnv(),
      });
      const durationMs = Date.now() - startedAtMs;
      if (result.exitCode !== 0) {
        const message = result.stderr.trim() || result.stdout.trim() || `Cursor CLI exited with code ${result.exitCode}`;
        const normalizedError = classifyLocalCliFailure(message);
        throw new BadGatewayError(message, normalizedError.code.toLowerCase());
      }
      const parsed = parseCursorCliOutput(result.stdout);
      const content = parsed.content;
      const generationRequest = {
        requestId,
        provider: "cursor",
        runtime: "cursor_cli",
        model: resolvedModel.selectedId,
        prompt,
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
        model: resolvedModel.selectedId,
        content,
        rawResponse: {
          runtimeSurface: "cursor_cli",
          workspaceMode: "isolated",
          workspacePathRetained: false,
          outputFormat: command.outputFormat,
          requestedModel: request.model,
          selectedModelLabel: resolvedModel.selectedDisplayName,
          selectedModelId: resolvedModel.selectedId,
          selectionSource: resolvedModel.source,
          parsed: parsed.parsed,
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
    } finally {
      await reservation.cleanup();
    }
  }
}
