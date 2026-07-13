import { spawn } from "node:child_process";
import type { ClaudeCliLocatorPort } from "./claude-cli.types.js";
import type { ClaudeInteractiveProcess, ClaudeInteractiveProcessLauncher } from "./claude-auth.types.js";
import { sanitizeClaudeSubscriptionEnvironment } from "./claude-environment-sanitizer.js";

class NodeClaudeInteractiveProcess implements ClaudeInteractiveProcess {
  constructor(private readonly child: ReturnType<typeof spawn>) {}

  write(input: string) {
    this.child.stdin?.write(input);
  }

  end() {
    this.child.stdin?.end();
  }

  kill(signal?: NodeJS.Signals) {
    this.child.kill(signal);
  }

  onStdout(listener: (chunk: string) => void) {
    this.child.stdout?.on("data", (chunk: Buffer | string) => listener(chunk.toString()));
  }

  onStderr(listener: (chunk: string) => void) {
    this.child.stderr?.on("data", (chunk: Buffer | string) => listener(chunk.toString()));
  }

  onExit(listener: (input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) {
    this.child.on("close", (exitCode, signal) => listener({ exitCode, signal }));
  }

  onError(listener: (error: Error) => void) {
    this.child.on("error", listener);
  }
}

export class NodeClaudeInteractiveProcessLauncher implements ClaudeInteractiveProcessLauncher {
  constructor(
    private readonly locator: ClaudeCliLocatorPort,
    private readonly options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ) {}

  async launch(input: {
    args: string[];
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }): Promise<ClaudeInteractiveProcess> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      const error = new Error("Claude CLI is not installed");
      (error as Error & { code?: string }).code = "CLI_NOT_INSTALLED";
      throw error;
    }

    const cwd = input.cwd ?? this.options?.cwd ?? process.cwd();
    const { childEnv } = sanitizeClaudeSubscriptionEnvironment(process.env, {
      ...this.options?.env,
      ...input.env,
    });
    const child = spawn(detection.executablePath, input.args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd,
      env: childEnv,
    });
    return new NodeClaudeInteractiveProcess(child);
  }
}
