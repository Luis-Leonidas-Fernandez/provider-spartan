export type ClaudeAuthEvent =
  | { type: "started"; flowId: string }
  | { type: "output"; text: string; stream: "stdout" | "stderr" }
  | { type: "open_url"; url: string }
  | { type: "input_required"; inputType: "code" | "text"; prompt?: string | undefined }
  | { type: "authenticated" }
  | { type: "expired" }
  | { type: "failed"; code: string; message: string }
  | { type: "cancelled" };

export type ClaudeAuthFlowStatus =
  | "running"
  | "authenticated"
  | "failed"
  | "cancelled";

export type ClaudeAuthFlowSnapshot = {
  flowId: string;
  status: ClaudeAuthFlowStatus;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  events: ClaudeAuthEvent[];
};

export interface ClaudeAuthFlowManagerPort {
  start(): Promise<ClaudeAuthFlowSnapshot>;
  get(flowId: string): ClaudeAuthFlowSnapshot | null;
  writeInput(flowId: string, input: string): Promise<ClaudeAuthFlowSnapshot>;
  cancel(flowId: string): Promise<ClaudeAuthFlowSnapshot>;
  subscribe(flowId: string, listener: (event: ClaudeAuthEvent) => void): (() => void) | null;
  cleanupExpired(now?: Date): number;
  cancelAll(reason?: string): number;
}

export interface ClaudeInteractiveProcess {
  write(input: string): void;
  end(): void;
  kill(signal?: NodeJS.Signals): void;
  onStdout(listener: (chunk: string) => void): void;
  onStderr(listener: (chunk: string) => void): void;
  onExit(listener: (input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void): void;
  onError(listener: (error: Error) => void): void;
}

export interface ClaudeInteractiveProcessLauncher {
  launch(input: {
    args: string[];
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }): Promise<ClaudeInteractiveProcess>;
}
