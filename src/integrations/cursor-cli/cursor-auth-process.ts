import { spawn } from "node:child_process";
import type { CursorCliLocatorPort } from "./cursor-cli.types.js";
import type { CursorInteractiveProcess, CursorInteractiveProcessLauncher } from "./cursor-auth.types.js";
import { sanitizeCursorSubscriptionEnvironment } from "./cursor-environment-sanitizer.js";
import { sendSignalToProcessTree } from "../../shared/local-cli-runtime/local-cli-process-tree.js";

class NodeCursorInteractiveProcess implements CursorInteractiveProcess {
  constructor(private readonly child: ReturnType<typeof spawn>) {}

  write(input: string) {
    this.child.stdin?.write(input);
  }

  end() {
    this.child.stdin?.end();
  }

  kill(signal?: NodeJS.Signals) {
    sendSignalToProcessTree(this.child, signal ?? "SIGTERM");
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

export class NodeCursorInteractiveProcessLauncher implements CursorInteractiveProcessLauncher {
  constructor(
    private readonly locator: CursorCliLocatorPort,
    private readonly options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ) {}

  async launch(input: {
    args: string[];
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }): Promise<CursorInteractiveProcess> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      const error = new Error("Cursor CLI is not installed");
      (error as Error & { code?: string }).code = "CLI_NOT_INSTALLED";
      throw error;
    }

    const cwd = input.cwd ?? this.options?.cwd ?? process.cwd();
    const { childEnv } = sanitizeCursorSubscriptionEnvironment(process.env, {
      ...this.options?.env,
      ...input.env,
    });
    const child = spawn(detection.executablePath, input.args, {
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd,
      env: childEnv,
    });

    return new NodeCursorInteractiveProcess(child);
  }
}
