import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CursorCliDetectionResult, CursorCliExecutableName, CursorCliLocatorPort } from "./cursor-cli.types.js";

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

function defaultFallbackLocations(platform: NodeJS.Platform) {
  if (platform === "win32") {
    return [
      "C:\\Program Files\\Cursor\\resources\\app\\bin\\agent.exe",
      "C:\\Program Files\\Cursor\\resources\\app\\bin\\cursor-agent.exe",
    ];
  }
  return [
    "~/.cursor/bin/agent",
    "~/.local/bin/agent",
    "/opt/homebrew/bin/agent",
    "/usr/local/bin/agent",
    "/usr/bin/agent",
    "~/.cursor/bin/cursor-agent",
    "~/.local/bin/cursor-agent",
    "/opt/homebrew/bin/cursor-agent",
    "/usr/local/bin/cursor-agent",
    "/usr/bin/cursor-agent",
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

async function readCommandOutput(candidate: string, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, args, {
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    });
    return `${stdout}\n${stderr}`.trim();
  } catch {
    return "";
  }
}

function inferExecutableName(candidate: string, explicit = false): CursorCliExecutableName {
  const basename = path.basename(candidate).toLowerCase();
  if (basename.startsWith("cursor-agent")) return "cursor-agent";
  if (basename.startsWith("agent")) return "agent";
  return explicit ? "custom" : "agent";
}

async function probeCursorOwnership(candidate: string, executableName: CursorCliExecutableName) {
  const versionOutput = await readCommandOutput(candidate, ["--version"]);
  const helpOutput = await readCommandOutput(candidate, ["--help"]);
  const combined = `${versionOutput}\n${helpOutput}`.toLowerCase();
  const looksCursorOwned = executableName === "custom"
    ? Boolean(versionOutput || helpOutput)
    : executableName === "cursor-agent"
      ? Boolean(versionOutput || helpOutput)
      : /\bcursor\b/.test(combined);

  return {
    accepted: looksCursorOwned,
    version: versionOutput
      ? versionOutput.split("\n").map((line) => line.trim()).find(Boolean) ?? null
      : null,
  };
}

export class CursorCliLocator implements CursorCliLocatorPort {
  private cachedResult: CursorCliDetectionResult | null = null;

  constructor(
    private readonly options?: {
      explicitPath?: string;
      env?: NodeJS.ProcessEnv;
      platform?: NodeJS.Platform;
      fallbackLocations?: string[];
    },
  ) {}

  invalidateCache() {
    this.cachedResult = null;
  }

  async locate(): Promise<CursorCliDetectionResult> {
    if (this.cachedResult) return this.cachedResult;

    const env = this.options?.env ?? process.env;
    const platform = this.options?.platform ?? process.platform;
    const searchedCandidates: string[] = [];
    const searchedLocations: string[] = [];

    const explicitPath = this.options?.explicitPath?.trim() || env.CURSOR_CLI_PATH?.trim();
    if (explicitPath) {
      const candidate = expandHome(explicitPath);
      searchedCandidates.push(candidate);
      searchedLocations.push(candidate);
      if (await isExecutable(candidate)) {
        const probe = await probeCursorOwnership(candidate, inferExecutableName(candidate, true));
        if (probe.accepted) {
          this.cachedResult = {
            installed: true,
            executableName: inferExecutableName(candidate, true),
            executablePath: candidate,
            version: probe.version,
            searchedCandidates,
            searchedLocations,
          };
          return this.cachedResult;
        }
      }
    }

    const pathCandidates = ["agent", "cursor-agent"];
    for (const entry of splitPathEntries(env.PATH)) {
      for (const binaryName of pathCandidates) {
        const candidate = path.join(entry, binaryName);
        searchedCandidates.push(binaryName);
        searchedLocations.push(candidate);
        if (!(await isExecutable(candidate))) continue;
        const executableName = inferExecutableName(candidate);
        const probe = await probeCursorOwnership(candidate, executableName);
        if (!probe.accepted) continue;
        this.cachedResult = {
          installed: true,
          executableName,
          executablePath: candidate,
          version: probe.version,
          searchedCandidates,
          searchedLocations,
        };
        return this.cachedResult;
      }
    }

    for (const raw of this.options?.fallbackLocations ?? defaultFallbackLocations(platform)) {
      const candidate = expandHome(raw);
      searchedCandidates.push(path.basename(candidate));
      searchedLocations.push(candidate);
      if (!(await isExecutable(candidate))) continue;
      const executableName = inferExecutableName(candidate);
      const probe = await probeCursorOwnership(candidate, executableName);
      if (!probe.accepted) continue;
      this.cachedResult = {
        installed: true,
        executableName,
        executablePath: candidate,
        version: probe.version,
        searchedCandidates,
        searchedLocations,
      };
      return this.cachedResult;
    }

    this.cachedResult = {
      installed: false,
      searchedCandidates,
      searchedLocations,
    };
    return this.cachedResult;
  }
}
