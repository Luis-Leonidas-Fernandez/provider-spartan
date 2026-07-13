import type { GeminiRuntimeSurface } from "../../../../shared/provider-runtime/gemini-runtime.js";

export function getMissingGeminiRuntimeScopes(input: {
  runtimeSurface: GeminiRuntimeSurface;
  scopes: readonly string[];
}) {
  void input;
  return [];
}

export function requiresGeminiRuntimeReconnect(input: {
  runtimeSurface: GeminiRuntimeSurface;
  scopes: readonly string[];
}) {
  return getMissingGeminiRuntimeScopes(input).length > 0;
}

export function getGeminiRuntimeReconnectMessage(missingScopes: readonly string[]) {
  return missingScopes.length
    ? `Gemini OAuth connected, but reconnect required to grant runtime scopes: ${missingScopes.join(", ")}`
    : "Gemini runtime is ready for the Antigravity surface.";
}
