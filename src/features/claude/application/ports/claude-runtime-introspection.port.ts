export type ClaudeCliCapabilities = {
  supportsAuthStatus: boolean;
  supportsAuthLogin: boolean;
  supportsPrintMode: boolean;
  supportsStdinInput: boolean;
  supportsStreamJsonInput: boolean;
  supportsStreamJsonOutput: boolean;
  supportsModelArgument: boolean;
  supportsSessionId: boolean;
  supportsResume: boolean;
  detectedArguments: string[];
};

export type ClaudeCliStatusSnapshot = {
  provider: "claude-cli-subscription";
  executionMode: "local-cli";
  state: string;
  cli: {
    installed: boolean;
    path: string | null;
    version: string | null;
    searchedLocations: string[];
  };
  authentication: {
    authenticated: boolean;
    method: "claude-subscription" | "claude_setup_token" | "unknown";
  };
  capabilities: ClaudeCliCapabilities | null;
  actions: Array<Record<string, unknown>>;
  message: string | null;
};

export interface ClaudeRuntimeIntrospectionPort {
  inspect(): Promise<ClaudeCliStatusSnapshot>;
}
