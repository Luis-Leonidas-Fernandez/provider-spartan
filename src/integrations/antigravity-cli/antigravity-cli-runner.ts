import { spawn } from "node:child_process";
import type { AntigravityCliLocatorPort, AntigravityCliRunOptions, AntigravityCliRunResult, AntigravityCliRunner } from "./antigravity-cli.types.js";
import { redactAntigravityCliOutput } from "./antigravity-cli-redaction.js";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";
import { terminateProcessTree } from "../../shared/local-cli-runtime/local-cli-process-tree.js";

const DEFAULT_MAX_CAPTURED_OUTPUT_BYTES = 2 * 1024 * 1024;

function appendWithLimit(current: string, chunk: Buffer, maxBytes: number) {
  if (Buffer.byteLength(current) >= maxBytes) return current;
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next) <= maxBytes) return next;
  return next.slice(0, maxBytes);
}

export class NodeAntigravityCliRunner implements AntigravityCliRunner {
  constructor(
    private readonly locator: AntigravityCliLocatorPort,
    private readonly options?: {
      env?: NodeJS.ProcessEnv;
      cwd?: string;
      supervisor?: LocalCliProcessSupervisor;
    },
  ) {}

  async run(args: string[], options: AntigravityCliRunOptions): Promise<AntigravityCliRunResult> {
    if (this.options?.supervisor) {
      return await this.options.supervisor.run(
        (supervisorSignal) => this.runWithoutSupervisor(args, { ...options, signal: supervisorSignal }),
        { ...(options.signal !== undefined ? { signal: options.signal } : {}), timeoutMs: options.timeoutMs },
      );
    }
    return await this.runWithoutSupervisor(args, options);
  }

  private async runWithoutSupervisor(args: string[], options: AntigravityCliRunOptions): Promise<AntigravityCliRunResult> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      const error = new Error("Antigravity CLI is not installed");
      (error as Error & { code?: string }).code = "CLI_NOT_INSTALLED";
      throw error;
    }

    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_CAPTURED_OUTPUT_BYTES;

    return await new Promise((resolve, reject) => {
      const child = spawn(detection.executablePath, args, {
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        cwd: options.cwd ?? this.options?.cwd ?? process.cwd(),
        env: {
          ...process.env,
          ...this.options?.env,
          ...options.env,
        },
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      let closeSignal: NodeJS.Signals | null = null;
      let cleanupTermination: (() => void) | null = null;

      const cleanupAbort = () => {
        options.signal?.removeEventListener("abort", onAbort);
      };
      const clearTermination = () => {
        cleanupTermination?.();
        cleanupTermination = null;
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanupAbort();
        cleanupTermination = terminateProcessTree(child);
        const error = new Error("Antigravity CLI run aborted");
        (error as Error & { code?: string }).code = "ABORT_ERR";
        reject(error);
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        settled = true;
        cleanupAbort();
        cleanupTermination = terminateProcessTree(child);
        const error = new Error(`Antigravity CLI timed out after ${options.timeoutMs}ms`);
        (error as Error & { code?: string }).code = "ETIMEDOUT";
        reject(error);
      }, options.timeoutMs);

      if (options.signal) {
        if (options.signal.aborted) return onAbort();
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      if (options.inputText !== undefined) {
        child.stdin?.write(options.inputText);
      }
      child.stdin?.end();

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendWithLimit(stdout, chunk, maxOutputBytes);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendWithLimit(stderr, chunk, maxOutputBytes);
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanupAbort();
        clearTermination();
        reject(error);
      });
      child.on("close", (code, signal) => {
        closeSignal = signal;
        clearTimeout(timeout);
        cleanupAbort();
        clearTermination();
        if (settled) return;
        settled = true;
        resolve({
          exitCode: code ?? 1,
          stdout: redactAntigravityCliOutput(stdout),
          stderr: redactAntigravityCliOutput(stderr),
          timedOut,
          signal: closeSignal,
        });
      });
    });
  }
}
