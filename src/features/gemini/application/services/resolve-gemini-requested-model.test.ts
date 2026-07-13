import { describe, expect, it } from "vitest";
import { resolveGeminiRequestedModel } from "./resolve-gemini-requested-model.js";

const availableModels = [
  {
    label: "Gemini 3.5 Flash (Low)",
    runtimeModel: "flash",
    catalogModelKey: "gemini-3.5-flash",
    family: "gemini",
    quality: "low",
    aliases: ["gemini-2.5-flash", "flash"],
    source: "antigravity",
  },
  {
    label: "Gemini 3.5 Flash (Medium)",
    runtimeModel: "flash",
    catalogModelKey: "gemini-3.5-flash",
    family: "gemini",
    quality: "medium",
    aliases: ["gemini-2.5-flash", "flash"],
    source: "antigravity",
  },
  {
    label: "Gemini 3.1 Pro (Low)",
    runtimeModel: "pro",
    catalogModelKey: "gemini-3.1-pro",
    family: "gemini",
    quality: "low",
    aliases: ["gemini-2.5-pro", "pro"],
    source: "antigravity",
  },
  {
    label: "Gemini 3.1 Pro (High)",
    runtimeModel: "pro",
    catalogModelKey: "gemini-3.1-pro",
    family: "gemini",
    quality: "high",
    aliases: ["gemini-2.5-pro", "pro"],
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
] as const;

describe("resolveGeminiRequestedModel", () => {
  it("accepts real catalog labels", () => {
    expect(resolveGeminiRequestedModel({
      requestedModel: "Gemini 3.1 Pro (High)",
      availableModels: [...availableModels],
      defaultRuntimeModel: "pro",
    })).toMatchObject({
      selectedLabel: "Gemini 3.1 Pro (High)",
      runtimeModel: "pro",
      catalogModelKey: "gemini-3.1-pro",
      source: "catalog_label",
    });
  });

  it("maps legacy aliases to the preferred real label", () => {
    expect(resolveGeminiRequestedModel({
      requestedModel: "gemini-2.5-pro",
      availableModels: [...availableModels],
      defaultRuntimeModel: "pro",
    })).toMatchObject({
      selectedLabel: "Gemini 3.1 Pro (High)",
      runtimeModel: "pro",
      catalogModelKey: "gemini-3.1-pro",
      source: "catalog_alias",
    });
  });

  it("prefers the medium flash label for legacy flash aliases", () => {
    expect(resolveGeminiRequestedModel({
      requestedModel: "gemini-2.5-flash",
      availableModels: [...availableModels],
      defaultRuntimeModel: "flash",
    })).toMatchObject({
      selectedLabel: "Gemini 3.5 Flash (Medium)",
      runtimeModel: "flash",
      catalogModelKey: "gemini-3.5-flash",
      source: "catalog_alias",
    });
  });

  it("accepts non-gemini catalog keys", () => {
    expect(resolveGeminiRequestedModel({
      requestedModel: "claude-sonnet-4.6",
      availableModels: [...availableModels],
      defaultRuntimeModel: "pro",
    })).toMatchObject({
      selectedLabel: "Claude Sonnet 4.6 (Thinking)",
      runtimeModel: "pro",
      family: "claude",
      source: "catalog_alias",
    });
  });
});
