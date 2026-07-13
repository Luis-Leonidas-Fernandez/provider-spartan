import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AntigravityCliLocatorPort } from "./antigravity-cli.types.js";
import type { AntigravityInteractiveProcess, AntigravityInteractiveProcessLauncher } from "./antigravity-auth.types.js";
import { sendSignalToProcessTree } from "../../shared/local-cli-runtime/local-cli-process-tree.js";

class NodeAntigravityInteractiveProcess implements AntigravityInteractiveProcess {
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

export class NodeAntigravityInteractiveProcessLauncher implements AntigravityInteractiveProcessLauncher {
  constructor(
    private readonly locator: AntigravityCliLocatorPort,
    private readonly options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      logDir?: string;
    },
  ) {}

  async launch(input: {
    args: string[];
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }): Promise<AntigravityInteractiveProcess> {
    const detection = await this.locator.locate();
    if (!detection.installed) {
      const error = new Error("Antigravity CLI is not installed");
      (error as Error & { code?: string }).code = "CLI_NOT_INSTALLED";
      throw error;
    }

    const logFile = path.join(this.options?.logDir ?? tmpdir(), `agy-auth-${Date.now()}.log`);
    const child = spawn(detection.executablePath, ["--log-file", logFile, ...input.args], {
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: input.cwd ?? this.options?.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...this.options?.env,
        ...input.env,
      },
    });
    return new NodeAntigravityInteractiveProcess(child);
  }
}
