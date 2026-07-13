export type CursorAvailableModel = {
  id: string;
  provider: "cursor-cli-subscription";
  displayName: string;
  available: boolean;
  availabilitySource: "cli" | "configured" | "probed" | "unknown";
  capabilities: {
    streaming: boolean | null;
    tools: boolean | null;
    images: boolean | null;
    fileAccess: boolean | null;
  };
  aliases: string[];
  source: "cursor_cli";
};

export interface CursorModelCatalogPort {
  listAvailableModels(): Promise<CursorAvailableModel[]>;
}
