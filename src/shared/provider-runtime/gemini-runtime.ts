export type GeminiRuntimeSurface = "antigravity";

export const DEFAULT_GEMINI_RUNTIME_SURFACE: GeminiRuntimeSurface = "antigravity";
export const DEFAULT_ANTIGRAVITY_CLI_BIN = "agy";
export const DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS = 60_000;

export function resolveGeminiRuntimeSurface(value: string | null | undefined): GeminiRuntimeSurface {
  if (value === "antigravity" || !value) return DEFAULT_GEMINI_RUNTIME_SURFACE;
  if (value === "auth_only") {
    throw new Error("Gemini auth-only runtime is disabled. Use GEMINI_RUNTIME_SURFACE=antigravity.");
  }
  if (value === "oauth_rest") {
    throw new Error("Gemini OAuth REST runtime is blocked because it requires Google API billing/prepay. Use GEMINI_RUNTIME_SURFACE=antigravity.");
  }
  if (value === "cli") {
    throw new Error("Gemini CLI runtime is disabled for this project. Use GEMINI_RUNTIME_SURFACE=antigravity.");
  }
  if (value === "vertex") {
    throw new Error("Gemini Vertex runtime is disabled for this project. Use GEMINI_RUNTIME_SURFACE=antigravity.");
  }
  return DEFAULT_GEMINI_RUNTIME_SURFACE;
}

export type GeminiCliRunnerOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  inputText?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
};

export type GeminiCliRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
};

export interface GeminiCliRunner {
  run(args: string[], options: GeminiCliRunnerOptions): Promise<GeminiCliRunnerResult>;
}
