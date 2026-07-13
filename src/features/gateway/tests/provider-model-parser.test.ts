import { describe, expect, it } from "vitest";
import { parseProviderModel } from "../domain/provider-model-parser.js";

describe("parseProviderModel", () => {
  it("parses explicit provider prefix", () => {
    expect(parseProviderModel("minimax/MiniMax-M3")).toEqual({ providerPrefix: "minimax", modelName: "MiniMax-M3" });
    expect(parseProviderModel("kimi/kimi-k2.7-code")).toEqual({ providerPrefix: "kimi", modelName: "kimi-k2.7-code" });
    expect(parseProviderModel("local/qwen-3-14b")).toEqual({ providerPrefix: "local", modelName: "qwen-3-14b" });
    expect(parseProviderModel("gemini/gemini-2.5-pro")).toEqual({ providerPrefix: "gemini", modelName: "gemini-2.5-pro" });
    expect(parseProviderModel("antigravity/Gemini 3.1 Pro (High)")).toEqual({ providerPrefix: "antigravity", modelName: "Gemini 3.1 Pro (High)" });
    expect(parseProviderModel("claude/sonnet")).toEqual({ providerPrefix: "claude", modelName: "sonnet" });
    expect(parseProviderModel("cursor/Cursor Fast")).toEqual({ providerPrefix: "cursor", modelName: "Cursor Fast" });
  });

  it("uses default provider when there is no prefix", () => {
    expect(parseProviderModel("gpt-4o-mini")).toEqual({ modelName: "gpt-4o-mini" });
  });
});
