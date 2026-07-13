export type CursorCliCapabilities = {
  supportsLogin: boolean;
  supportsStatus: boolean;
  supportsStatusJson: boolean;
  supportsLogout: boolean;
  supportsModelListing: boolean;
  supportsModelArgument: boolean;
  supportsPrintMode: boolean;
  supportsStdinPrompt: boolean;
  supportsJsonOutput: boolean;
  supportsStreamJsonOutput: boolean;
  supportsPartialStreaming: boolean;
  supportsWorkspaceArgument: boolean;
  supportsSessionResume: boolean;
  supportsNoBrowserLogin: boolean;
  supportsTrustArgument: boolean;
  supportsForceArgument: boolean;
  detectedArguments: string[];
};

export type CursorCliStatusSnapshot = {
  provider: "cursor-cli-subscription";
  executionMode: "local-cli";
  state: string;
  cli: {
    installed: boolean;
    executable: "agent" | "cursor-agent" | "custom" | null;
    path: string | null;
    version: string | null;
    searchedCandidates: string[];
    searchedLocations: string[];
  };
  authentication: {
    authenticated: boolean;
    method: "cursor-account";
  };
  capabilities: CursorCliCapabilities | null;
  actions: Array<Record<string, unknown>>;
  message: string | null;
};

export interface CursorRuntimeIntrospectionPort {
  inspect(): Promise<CursorCliStatusSnapshot>;
}
