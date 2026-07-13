export type AntigravityCliCapabilities = {
  supportsPrintMode: boolean;
  supportsStdinPrompt: boolean;
  supportsModelArgument: boolean;
  supportsJsonOutput: boolean;
  supportsStreaming: boolean;
  supportsLoginCommand: boolean;
  supportsLogoutCommand: boolean;
  supportsModelListing: boolean;
  detectedArguments: string[];
};

export type AntigravityRuntimeStatusSnapshot = {
  provider: "antigravity";
  executionMode: "local-cli";
  state: string;
  cli: {
    installed: boolean;
    path: string | null;
    version: string | null;
    searchedLocations: string[];
  };
  authentication: { authenticated: boolean };
  capabilities: AntigravityCliCapabilities | null;
  actions: Array<Record<string, unknown>>;
  message: string | null;
};

export interface AntigravityRuntimeIntrospectionPort {
  inspect(): Promise<AntigravityRuntimeStatusSnapshot>;
}
