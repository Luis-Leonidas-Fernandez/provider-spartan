export type CliDetectionResult =
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

export type ProviderConnectionState =
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

export type AntigravityCliStatusAction =
  | {
      type: "OPEN_INSTALLATION_GUIDE";
      provider: "antigravity";
    }
  | {
      type: "OPEN_ANTIGRAVITY_LOGIN";
      label: string;
    };

export type AntigravityCliAuthenticationStatus = {
  authenticated: boolean;
};

export type AntigravityCliStatusSnapshot = {
  provider: "antigravity";
  executionMode: "local-cli";
  state: ProviderConnectionState;
  cli: {
    installed: boolean;
    path: string | null;
    version: string | null;
    searchedLocations: string[];
  };
  authentication: AntigravityCliAuthenticationStatus;
  capabilities: AntigravityCliCapabilities | null;
  actions: AntigravityCliStatusAction[];
  message: string | null;
};

export type AntigravityCliRunOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  inputText?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
};

export type AntigravityCliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
};

export interface AntigravityCliRunner {
  run(args: string[], options: AntigravityCliRunOptions): Promise<AntigravityCliRunResult>;
}

export interface AntigravityCliLocatorPort {
  locate(): Promise<CliDetectionResult>;
}
