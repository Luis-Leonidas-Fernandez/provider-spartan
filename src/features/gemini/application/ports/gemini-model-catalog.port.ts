export type GeminiAvailableModel = {
  label: string;
  runtimeModel: string;
  catalogModelKey: string;
  family: "gemini" | "claude" | "gpt-oss" | "unknown";
  quality: "low" | "medium" | "high" | "thinking" | "unknown";
  source: "antigravity" | "static_fallback";
  aliases?: readonly string[] | undefined;
};

export interface GeminiModelCatalogPort {
  listAvailableModels(): Promise<GeminiAvailableModel[]>;
}
