import type {
  AntigravityCliCapabilities,
  AntigravityCliLocatorPort,
  AntigravityCliRunner,
} from "./antigravity-cli.types.js";

function detectArguments(helpText: string) {
  return [...new Set(
    Array.from(helpText.matchAll(/--?[a-z0-9][a-z0-9-]*/gi)).map((match) => match[0].toLowerCase()),
  )];
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export class AntigravityCliCapabilitiesInspector {
  constructor(
    private readonly locator: AntigravityCliLocatorPort,
    private readonly runner: AntigravityCliRunner,
    private readonly timeoutMs = 4_000,
  ) {}

  async inspect(): Promise<AntigravityCliCapabilities | null> {
    const detection = await this.locator.locate();
    if (!detection.installed) return null;

    const [helpResult, versionResult] = await Promise.allSettled([
      this.runner.run(["--help"], { timeoutMs: this.timeoutMs }),
      this.runner.run(["--version"], { timeoutMs: this.timeoutMs }),
    ]);

    const helpText = helpResult.status === "fulfilled"
      ? `${helpResult.value.stdout}\n${helpResult.value.stderr}`.toLowerCase()
      : "";
    const versionText = versionResult.status === "fulfilled"
      ? `${versionResult.value.stdout}\n${versionResult.value.stderr}`.toLowerCase()
      : "";
    const combined = `${helpText}\n${versionText}`;
    const detectedArguments = detectArguments(combined);

    return {
      supportsPrintMode: includesAny(combined, [/--print/, /\bprint mode\b/]),
      supportsStdinPrompt: includesAny(combined, [/\bstdin\b/, /\bprompt\b/, /\binput\b/]),
      supportsModelArgument: includesAny(combined, [/--model/]),
      supportsJsonOutput: includesAny(combined, [/--json/, /\bjson\b/]),
      supportsStreaming: includesAny(combined, [/\bstream\b/, /--stream/, /\bsse\b/]),
      supportsLoginCommand: includesAny(combined, [/\blogin\b/, /\bauth\b/, /\bsign in\b/]),
      supportsLogoutCommand: includesAny(combined, [/\blogout\b/, /\bsign out\b/]),
      supportsModelListing: includesAny(combined, [/\bmodels\b/, /\blist models\b/]),
      detectedArguments,
    };
  }
}
