import { describe, expect, it } from "vitest";
import { summarizeGeminiModelCatalog } from "./summarize-gemini-model-catalog.js";

describe("summarizeGeminiModelCatalog", () => {
  it("groups variant labels by catalog model key and removes duplicate keys", () => {
    const summary = summarizeGeminiModelCatalog([
      {
        label: "Gemini 3.5 Flash (Medium)",
        runtimeModel: "flash",
        catalogModelKey: "gemini-3.5-flash",
        family: "gemini",
        quality: "medium",
        aliases: ["gemini-2.5-flash"],
        source: "antigravity",
      },
      {
        label: "Gemini 3.5 Flash (High)",
        runtimeModel: "flash",
        catalogModelKey: "gemini-3.5-flash",
        family: "gemini",
        quality: "high",
        aliases: ["gemini-2.5-flash"],
        source: "antigravity",
      },
      {
        label: "Claude Sonnet 4.6 (Thinking)",
        runtimeModel: "pro",
        catalogModelKey: "claude-sonnet-4.6",
        family: "claude",
        quality: "thinking",
        aliases: ["claude-sonnet-4.6"],
        source: "antigravity",
      },
    ]);

    expect(summary).toEqual({
      uniqueCatalogModelKeys: ["gemini-3.5-flash", "claude-sonnet-4.6"],
      modelVariantsByKey: {
        "gemini-3.5-flash": [
          "Gemini 3.5 Flash (Medium)",
          "Gemini 3.5 Flash (High)",
        ],
        "claude-sonnet-4.6": [
          "Claude Sonnet 4.6 (Thinking)",
        ],
      },
    });
  });
});

