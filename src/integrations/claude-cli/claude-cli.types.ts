export type ClaudeCliDetectionResult =
  | {
      installed: true;
      executablePath: string;
      version: string | null;
      searchedLocations: string[];
    }
  | {
      installed: false;
      searchedLocations: string[];
    };

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

export type ClaudeProviderConnectionState =
  | "checking"
  | "cli_not_installed"
  | "cli_installed"
  | "authentication_required"
  | "authentication_pending"
  | "ready"
  | "quota_exhausted"
  | "rate_limited"
  | "update_required"
  | "temporarily_unavailable"
  | "error";

export type ClaudeCliStatusAction =
  | {
      type: "OPEN_INSTALLATION_GUIDE";
      provider: "claude-cli-subscription";
    }
  | {
      type: "START_AUTHENTICATION";
      label: string;
    }
  | {
      type: "IMPORT_SETUP_TOKEN";
      label: string;
    };

export type ClaudeCliAuthenticationStatus = {
  authenticated: boolean;
  method: "claude-subscription" | "claude_setup_token" | "unknown";
};

export type ClaudeCliStatusSnapshot = {
  provider: "claude-cli-subscription";
  executionMode: "local-cli";
  state: ClaudeProviderConnectionState;
  cli: {
    installed: boolean;
    path: string | null;
    version: string | null;
    searchedLocations: string[];
  };
  authentication: ClaudeCliAuthenticationStatus;
  capabilities: ClaudeCliCapabilities | null;
  actions: ClaudeCliStatusAction[];
  message: string | null;
};

export interface ClaudeCliLocatorPort {
  locate(): Promise<ClaudeCliDetectionResult>;
}
