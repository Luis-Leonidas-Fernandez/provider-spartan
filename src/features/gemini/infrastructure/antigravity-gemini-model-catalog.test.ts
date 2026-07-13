import { describe, expect, it } from "vitest";
import { parseAntigravityModelsOutput } from "./antigravity-gemini-model-catalog.js";

describe("parseAntigravityModelsOutput", () => {
  it("extracts labels, runtime models, family and quality from agy models", () => {
    const models = parseAntigravityModelsOutput([
      "Gemini 3.5 Flash (Medium)",
      "Gemini 3.1 Pro (High)",
      "Claude Sonnet 4.6 (Thinking)",
      "GPT-OSS 120B (Medium)",
    ].join("\n"));

    expect(models).toEqual([
      {
        label: "Gemini 3.5 Flash (Medium)",
        runtimeModel: "flash",
        catalogModelKey: "gemini-3.5-flash",
        family: "gemini",
        quality: "medium",
        aliases: expect.arrayContaining(["gemini-2.5-flash", "flash"]),
        source: "antigravity",
      },
      {
        label: "Gemini 3.1 Pro (High)",
        runtimeModel: "pro",
        catalogModelKey: "gemini-3.1-pro",
        family: "gemini",
        quality: "high",
        aliases: expect.arrayContaining(["gemini-2.5-pro", "pro"]),
        source: "antigravity",
      },
      {
        label: "Claude Sonnet 4.6 (Thinking)",
        runtimeModel: "pro",
        catalogModelKey: "claude-sonnet-4.6",
        family: "claude",
        quality: "thinking",
        aliases: expect.arrayContaining(["claude-sonnet-4.6"]),
        source: "antigravity",
      },
      {
        label: "GPT-OSS 120B (Medium)",
        runtimeModel: "flash",
        catalogModelKey: "gpt-oss-120b",
        family: "gpt-oss",
        quality: "medium",
        aliases: expect.arrayContaining(["gpt-oss-120b"]),
        source: "antigravity",
      },
    ]);
  });
});
