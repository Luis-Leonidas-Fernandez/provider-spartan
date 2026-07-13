import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ClaudeCliDetectionResult, ClaudeCliLocatorPort } from "./claude-cli.types.js";

const execFileAsync = promisify(execFile);
const VERSION_TIMEOUT_MS = 4_000;

function splitPathEntries(value: string | undefined) {
  return (value ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function expandHome(input: string) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function defaultBinaryNames(platform: NodeJS.Platform, configuredName?: string) {
  const names = new Set<string>();
  if (configuredName?.trim()) names.add(configuredName.trim());
  names.add("claude");
  if (platform === "win32") {
    names.add("claude.exe");
    names.add("claude.cmd");
    names.add("claude.bat");
  }
  return [...names];
}

function defaultFallbackLocations(platform: NodeJS.Platform) {
  if (platform === "win32") {
    return [
      "C:\\Program Files\\Claude\\claude.exe",
      "C:\\Program Files (x86)\\Claude\\claude.exe",
    ];
  }
  return [
    "~/.local/bin/claude",
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  ];
}

async function isExecutable(candidate: string) {
  try {
    await fs.access(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readVersion(candidate: string) {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["--version"], {
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    });
    const output = `${stdout}\n${stderr}`.trim();
    if (!output) return null;
    const firstLine = output.split("\n").map((line) => line.trim()).find(Boolean);
    return firstLine ?? null;
  } catch {
    return null;
  }
}

export class ClaudeCliLocator implements ClaudeCliLocatorPort {
  constructor(
    private readonly options?: {
      explicitPath?: string;
      explicitBinaryName?: string;
      env?: NodeJS.ProcessEnv;
      platform?: NodeJS.Platform;
      fallbackLocations?: string[];
    },
  ) {}

  async locate(): Promise<ClaudeCliDetectionResult> {
    const env = this.options?.env ?? process.env;
    const platform = this.options?.platform ?? process.platform;
    const searchedLocations: string[] = [];

    const explicitCandidates = [
      this.options?.explicitPath,
      env.CLAUDE_CLI_PATH,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map(expandHome);

    for (const candidate of explicitCandidates) {
      searchedLocations.push(candidate);
      if (!(await isExecutable(candidate))) continue;
      return {
        installed: true,
        executablePath: candidate,
        version: await readVersion(candidate),
        searchedLocations,
      };
    }

    const binaryNames = defaultBinaryNames(platform, this.options?.explicitBinaryName ?? env.CLAUDE_CLI_BIN);
    for (const entry of splitPathEntries(env.PATH)) {
      for (const binaryName of binaryNames) {
        const candidate = path.join(entry, binaryName);
        searchedLocations.push(candidate);
        if (!(await isExecutable(candidate))) continue;
        return {
          installed: true,
          executablePath: candidate,
          version: await readVersion(candidate),
          searchedLocations,
        };
      }
    }

    for (const raw of this.options?.fallbackLocations ?? defaultFallbackLocations(platform)) {
      const candidate = expandHome(raw);
      searchedLocations.push(candidate);
      if (!(await isExecutable(candidate))) continue;
      return {
        installed: true,
        executablePath: candidate,
        version: await readVersion(candidate),
        searchedLocations,
      };
    }

    return {
      installed: false,
      searchedLocations,
    };
  }
}
