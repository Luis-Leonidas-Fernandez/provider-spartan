import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AntigravityCliLocatorPort, CliDetectionResult } from "./antigravity-cli.types.js";

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
  names.add("agy");
  if (platform === "win32") {
    names.add("agy.exe");
    names.add("agy.cmd");
    names.add("agy.bat");
  }
  return [...names];
}

function defaultFallbackLocations(platform: NodeJS.Platform) {
  if (platform === "win32") {
    return [
      "C:\\Program Files\\Antigravity\\agy.exe",
      "C:\\Program Files (x86)\\Antigravity\\agy.exe",
    ];
  }
  return [
    "~/.local/bin/agy",
    "/opt/homebrew/bin/agy",
    "/usr/local/bin/agy",
    "/usr/bin/agy",
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

export class AntigravityCliLocator implements AntigravityCliLocatorPort {
  constructor(
    private readonly options?: {
      explicitPath?: string;
      explicitBinaryName?: string;
      env?: NodeJS.ProcessEnv;
      platform?: NodeJS.Platform;
      fallbackLocations?: string[];
    },
  ) {}

  async locate(): Promise<CliDetectionResult> {
    const env = this.options?.env ?? process.env;
    const platform = this.options?.platform ?? process.platform;
    const searchedLocations: string[] = [];

    const explicitCandidates = [
      this.options?.explicitPath,
      env.ANTIGRAVITY_CLI_PATH,
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

    const binaryNames = defaultBinaryNames(platform, this.options?.explicitBinaryName ?? env.ANTIGRAVITY_CLI_BIN);
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
