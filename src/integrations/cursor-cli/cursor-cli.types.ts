export type CursorCliExecutableName = "agent" | "cursor-agent" | "custom";

export type CursorCliDetectionResult =
  | {
      installed: true;
      executableName: CursorCliExecutableName;
      executablePath: string;
      version: string | null;
      searchedCandidates: string[];
      searchedLocations: string[];
    }
  | {
      installed: false;
      searchedCandidates: string[];
      searchedLocations: string[];
    };

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

export type CursorProviderConnectionState =
  | "checking"
  | "cli_not_installed"
  | "cli_installed"
  | "authentication_required"
  | "authentication_pending"
  | "ready"
  | "no_models_available"
  | "quota_exhausted"
  | "rate_limited"
  | "update_required"
  | "temporarily_unavailable"
  | "error";

export type CursorCliStatusAction =
  | {
      type: "OPEN_INSTALLATION_GUIDE";
      provider: "cursor-cli-subscription";
      label: string;
    }
  | {
      type: "START_AUTHENTICATION";
      label: string;
    };

export type CursorCliStatusSnapshot = {
  provider: "cursor-cli-subscription";
  executionMode: "local-cli";
  state: CursorProviderConnectionState;
  cli: {
    installed: boolean;
    executable: CursorCliExecutableName | null;
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
  actions: CursorCliStatusAction[];
  message: string | null;
};

export type CursorCliConcurrencySnapshot = {
  activeCount: number;
  queuedCount: number;
  maxConcurrent: number;
  maxQueueSize: number;
};

export type CursorCliRunOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  inputText?: string;
  maxOutputBytes?: number;
};

export type CursorCliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
};

export interface CursorCliLocatorPort {
  locate(): Promise<CursorCliDetectionResult>;
}

export interface CursorCliCommandRunnerPort {
  run(args: string[], options: CursorCliRunOptions): Promise<CursorCliRunResult>;
}
