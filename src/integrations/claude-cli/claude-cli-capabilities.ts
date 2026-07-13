import type { ClaudeCliRunner } from "../provider-adapters/claude-runtime.js";
import type {
  ClaudeCliCapabilities,
  ClaudeCliLocatorPort,
} from "./claude-cli.types.js";

function detectArguments(helpText: string) {
  return [...new Set(
    Array.from(helpText.matchAll(/--?[a-z0-9][a-z0-9-]*/gi)).map((match) => match[0].toLowerCase()),
  )];
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export class ClaudeCliCapabilitiesInspector {
  constructor(
    private readonly locator: ClaudeCliLocatorPort,
    private readonly runner: ClaudeCliRunner,
    private readonly timeoutMs = 4_000,
  ) {}

  async inspect(): Promise<ClaudeCliCapabilities | null> {
    const detection = await this.locator.locate();
    if (!detection.installed) return null;

    const commands: Array<Promise<Awaited<ReturnType<ClaudeCliRunner["run"]>>>> = [
      this.runner.run(["--help"], { timeoutMs: this.timeoutMs }),
      this.runner.run(["--version"], { timeoutMs: this.timeoutMs }),
      this.runner.run(["auth", "--help"], { timeoutMs: this.timeoutMs }),
    ];

    const settled = await Promise.allSettled(commands);
    const helpResult = settled[0];
    const versionResult = settled[1];
    const authHelpResult = settled[2];
    const helpText = helpResult?.status === "fulfilled"
      ? `${helpResult.value.stdout}\n${helpResult.value.stderr}`.toLowerCase()
      : "";
    const versionText = versionResult?.status === "fulfilled"
      ? `${versionResult.value.stdout}\n${versionResult.value.stderr}`.toLowerCase()
      : "";
    const authHelpText = authHelpResult?.status === "fulfilled"
      ? `${authHelpResult.value.stdout}\n${authHelpResult.value.stderr}`.toLowerCase()
      : "";
    const combined = `${helpText}\n${versionText}\n${authHelpText}`;
    const detectedArguments = detectArguments(combined);

    return {
      supportsAuthStatus: includesAny(authHelpText, [/\bstatus\b/, /\blogin status\b/]),
      supportsAuthLogin: includesAny(authHelpText, [/\blogin\b/, /\bsign in\b/]),
      supportsPrintMode: includesAny(combined, [/\b-p\b/, /--print/, /\bprint mode\b/]),
      supportsStdinInput: includesAny(combined, [/\bstdin\b/, /\binput\b/]),
      supportsStreamJsonInput: includesAny(combined, [/stream-json/, /input-format/]),
      supportsStreamJsonOutput: includesAny(combined, [/stream-json/, /output-format/, /\bjson\b/]),
      supportsModelArgument: includesAny(combined, [/--model/]),
      supportsSessionId: includesAny(combined, [/session-id/, /session_id/]),
      supportsResume: includesAny(combined, [/\bresume\b/]),
      detectedArguments,
    };
  }
}
