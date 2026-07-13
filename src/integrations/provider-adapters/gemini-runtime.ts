export {
  DEFAULT_ANTIGRAVITY_CLI_BIN,
  DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS,
  DEFAULT_GEMINI_RUNTIME_SURFACE,
  resolveGeminiRuntimeSurface,
} from "../../shared/provider-runtime/gemini-runtime.js";
export type { GeminiRuntimeSurface } from "../../shared/provider-runtime/gemini-runtime.js";

export type {
  AntigravityCliRunOptions as GeminiCliRunnerOptions,
  AntigravityCliRunResult as GeminiCliRunnerResult,
  AntigravityCliRunner as GeminiCliRunner,
} from "../antigravity-cli/antigravity-cli.types.js";
