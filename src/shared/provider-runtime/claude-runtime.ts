export type ClaudeRuntimeSurface = "claude_code_cli";

export const DEFAULT_CLAUDE_RUNTIME_SURFACE: ClaudeRuntimeSurface = "claude_code_cli";
export const DEFAULT_CLAUDE_CLI_BIN = "claude";
export const DEFAULT_CLAUDE_CLI_TIMEOUT_MS = 60_000;

export function resolveClaudeRuntimeSurface(value: string | null | undefined): ClaudeRuntimeSurface {
  return value === "claude_code_cli" ? "claude_code_cli" : DEFAULT_CLAUDE_RUNTIME_SURFACE;
}

export type ClaudeCliRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ClaudeCliRunnerOptions = {
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  cwd?: string;
};

export interface ClaudeCliRunner {
  run(args: string[], options: ClaudeCliRunnerOptions): Promise<ClaudeCliRunnerResult>;
}
