import { spawn } from "node:child_process";
import type { ClaudeCliRunner, ClaudeCliRunnerOptions, ClaudeCliRunnerResult } from "./claude-runtime.js";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";
import { terminateProcessTree } from "../../shared/local-cli-runtime/local-cli-process-tree.js";

const MAX_CAPTURED_OUTPUT_BYTES = 2 * 1024 * 1024;

function appendWithLimit(current: string, chunk: Buffer) {
  if (Buffer.byteLength(current) >= MAX_CAPTURED_OUTPUT_BYTES) return current;
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next) <= MAX_CAPTURED_OUTPUT_BYTES) return next;
  return next.slice(0, MAX_CAPTURED_OUTPUT_BYTES);
}

export class NodeClaudeCliRunner implements ClaudeCliRunner {
  constructor(
    private readonly bin: string,
    private readonly options?: { supervisor?: LocalCliProcessSupervisor },
  ) {}

  async run(args: string[], options: ClaudeCliRunnerOptions): Promise<ClaudeCliRunnerResult> {
    const execute = async (signal: AbortSignal) => await new Promise<ClaudeCliRunnerResult>((resolve, reject) => {
      const child = spawn(this.bin, args, {
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: options.cwd,
        env: {
          ...process.env,
          ...(options.env ?? {}),
        },
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let cleanupTermination: (() => void) | null = null;
      const clearExecutionTimeout = () => {
        clearTimeout(timeout);
      };
      const clearTermination = () => {
        cleanupTermination?.();
        cleanupTermination = null;
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanupTermination = terminateProcessTree(child);
        clearExecutionTimeout();
        const error = new Error(`Claude CLI timed out after ${options.timeoutMs}ms`);
        (error as Error & { code?: string }).code = "ETIMEDOUT";
        reject(error);
      }, options.timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendWithLimit(stdout, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendWithLimit(stderr, chunk);
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearExecutionTimeout();
        clearTermination();
        reject(error);
      });
      signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        cleanupTermination = terminateProcessTree(child);
        clearExecutionTimeout();
        const reason = signal.reason ?? new Error("Claude CLI aborted");
        const error = reason instanceof Error ? reason : new Error(String(reason));
        (error as Error & { code?: string }).code = "ABORT_ERR";
        reject(error);
      }, { once: true });
      child.on("close", (code) => {
        clearExecutionTimeout();
        clearTermination();
        if (settled) return;
        settled = true;
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });

    if (this.options?.supervisor) {
      return await this.options.supervisor.run(
        (signal) => execute(signal),
        {
          ...(options.signal ? { signal: options.signal } : {}),
          timeoutMs: options.timeoutMs,
        },
      );
    }
    return await execute(options.signal ?? new AbortController().signal);
  }
}
