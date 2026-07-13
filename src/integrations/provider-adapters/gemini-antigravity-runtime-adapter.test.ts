import { describe, expect, it, vi } from "vitest";
import { GeminiAntigravityRuntimeAdapter } from "./gemini-antigravity-runtime-adapter.js";

describe("GeminiAntigravityRuntimeAdapter", () => {
  it("runs agy in print mode and normalizes Gemini model names", async () => {
    const runner = {
      run: vi.fn(async () => ({ exitCode: 0, stdout: "conectado\n", stderr: "", timedOut: false, signal: null })),
    };
    const adapter = new GeminiAntigravityRuntimeAdapter({ runner, cliBin: "agy" });

    const response = await adapter.chatCompletion({
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Respondé solo: conectado" }],
    }, {
      providerId: "provider-1",
      providerType: "gemini",
      providerName: "Gemini",
      baseUrl: null,
      credentialValue: null,
    });

    expect(response).toMatchObject({
      ok: true,
      status: "success",
      model: "gemini-2.5-pro",
      content: "conectado",
    });
    expect(runner.run).toHaveBeenCalledWith(
      ["--model", "pro", "--print", "user: Respondé solo: conectado"],
      { timeoutMs: 60000 },
    );
  });
});
