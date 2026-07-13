export type CursorCliRunOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  inputText?: string;
  maxOutputBytes?: number;
};

export type CursorCliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
};

export interface CursorCliCommandRunnerPort {
  run(args: string[], options: CursorCliRunOptions): Promise<CursorCliRunResult>;
}
