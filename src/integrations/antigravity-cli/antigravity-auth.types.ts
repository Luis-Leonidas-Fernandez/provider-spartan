export type AntigravityAuthEvent =
  | { type: "started"; flowId: string }
  | { type: "output"; text: string; stream: "stdout" | "stderr" }
  | { type: "open_url"; url: string }
  | { type: "input_required"; inputType: "code" | "text"; prompt?: string | undefined }
  | { type: "authenticated" }
  | { type: "expired" }
  | { type: "failed"; code: string; message: string }
  | { type: "cancelled" };

export type AntigravityAuthFlowStatus =
  | "running"
  | "authenticated"
  | "failed"
  | "cancelled";

export type AntigravityAuthFlowSnapshot = {
  flowId: string;
  status: AntigravityAuthFlowStatus;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  events: AntigravityAuthEvent[];
};

export interface AntigravityAuthFlowManagerPort {
  start(): Promise<AntigravityAuthFlowSnapshot>;
  get(flowId: string): AntigravityAuthFlowSnapshot | null;
  writeInput(flowId: string, input: string): Promise<AntigravityAuthFlowSnapshot>;
  cancel(flowId: string): Promise<AntigravityAuthFlowSnapshot>;
  subscribe(flowId: string, listener: (event: AntigravityAuthEvent) => void): (() => void) | null;
  cleanupExpired(now?: Date): number;
  cancelAll(reason?: string): number;
}

export interface AntigravityInteractiveProcess {
  write(input: string): void;
  end(): void;
  kill(signal?: NodeJS.Signals): void;
  onStdout(listener: (chunk: string) => void): void;
  onStderr(listener: (chunk: string) => void): void;
  onExit(listener: (input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void): void;
  onError(listener: (error: Error) => void): void;
}

export interface AntigravityInteractiveProcessLauncher {
  launch(input: {
    args: string[];
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }): Promise<AntigravityInteractiveProcess>;
}
