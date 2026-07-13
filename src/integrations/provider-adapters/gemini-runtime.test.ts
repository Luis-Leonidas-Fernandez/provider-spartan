import { describe, expect, it } from "vitest";
import { resolveGeminiRuntimeSurface } from "./gemini-runtime.js";

describe("Gemini runtime policy", () => {
  it("defaults to Antigravity and blocks every other Gemini runtime surface", () => {
    expect(resolveGeminiRuntimeSurface(undefined)).toBe("antigravity");
    expect(resolveGeminiRuntimeSurface("")).toBe("antigravity");
    expect(resolveGeminiRuntimeSurface("antigravity")).toBe("antigravity");
    expect(resolveGeminiRuntimeSurface("unknown")).toBe("antigravity");
    expect(() => resolveGeminiRuntimeSurface("auth_only")).toThrow("Gemini auth-only runtime is disabled");
    expect(() => resolveGeminiRuntimeSurface("cli")).toThrow("Gemini CLI runtime is disabled");
    expect(() => resolveGeminiRuntimeSurface("vertex")).toThrow("Gemini Vertex runtime is disabled");
    expect(() => resolveGeminiRuntimeSurface("oauth_rest")).toThrow("Gemini OAuth REST runtime is blocked");
  });
});
