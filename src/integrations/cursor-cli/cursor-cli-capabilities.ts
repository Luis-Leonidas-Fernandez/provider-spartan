import type {
  CursorCliCapabilities,
  CursorCliCommandRunnerPort,
  CursorCliLocatorPort,
} from "./cursor-cli.types.js";

function detectArguments(helpText: string) {
  return [...new Set(
    Array.from(helpText.matchAll(/--?[a-z0-9][a-z0-9-]*/gi)).map((match) => match[0].toLowerCase()),
  )];
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

async function runHelp(
  runner: CursorCliCommandRunnerPort,
  args: string[],
  timeoutMs: number,
) {
  try {
    const result = await runner.run(args, { timeoutMs });
    return `${result.stdout}\n${result.stderr}`.toLowerCase();
  } catch {
    return "";
  }
}

export class CursorCliCapabilitiesInspector {
  constructor(
    private readonly locator: CursorCliLocatorPort,
    private readonly runner: CursorCliCommandRunnerPort,
    private readonly timeoutMs = 4_000,
  ) {}

  async inspect(): Promise<CursorCliCapabilities | null> {
    const detection = await this.locator.locate();
    if (!detection.installed) return null;

    const rootHelp = await runHelp(this.runner, ["--help"], this.timeoutMs);
    const statusHelp = await runHelp(this.runner, ["status", "--help"], this.timeoutMs);
    const loginHelp = await runHelp(this.runner, ["login", "--help"], this.timeoutMs);
    const modelsHelp = await runHelp(this.runner, ["models", "--help"], this.timeoutMs);
    const logoutHelp = await runHelp(this.runner, ["logout", "--help"], this.timeoutMs);
    const version = await runHelp(this.runner, ["--version"], this.timeoutMs);
    const combined = [rootHelp, statusHelp, loginHelp, modelsHelp, logoutHelp, version]
      .filter(Boolean)
      .join("\n");
    const detectedArguments = detectArguments(combined);

    return {
      supportsLogin: Boolean(loginHelp) || includesAny(rootHelp, [/\blogin\b/, /\bauth\b/, /\bsign in\b/]),
      supportsStatus: Boolean(statusHelp) || includesAny(rootHelp, [/\bstatus\b/]),
      supportsStatusJson: includesAny(statusHelp, [/--json/, /\bjson\b/]),
      supportsLogout: Boolean(logoutHelp) || includesAny(rootHelp, [/\blogout\b/, /\bsign out\b/]),
      supportsModelListing: Boolean(modelsHelp) || includesAny(rootHelp, [/\bmodels\b/, /\blist models\b/]),
      supportsModelArgument: includesAny(combined, [/--model/]),
      supportsPrintMode: includesAny(combined, [/--print/, /\bprint\b/, /\bnon-interactive\b/]),
      supportsStdinPrompt: includesAny(combined, [/\bstdin\b/, /\bpipe\b/, /\binput\b/]),
      supportsJsonOutput: includesAny(combined, [/--json/, /\bjson\b/]),
      supportsStreamJsonOutput: includesAny(combined, [/--json-stream/, /--stream-json/, /\bjsonl\b/, /\bndjson\b/]),
      supportsPartialStreaming: includesAny(combined, [/\bstream\b/, /\bpartial\b/, /\bincremental\b/]),
      supportsWorkspaceArgument: includesAny(combined, [/--workspace/, /--cwd/, /--project-dir/]),
      supportsSessionResume: includesAny(combined, [/\bresume\b/, /\bcontinue\b/]),
      supportsNoBrowserLogin: includesAny(loginHelp, [/--no-browser/, /\bdevice code\b/, /\bcopy url\b/, /\bmanual code\b/]),
      supportsTrustArgument: includesAny(combined, [/--trust/]),
      supportsForceArgument: includesAny(combined, [/--force/]),
      detectedArguments,
    };
  }
}
