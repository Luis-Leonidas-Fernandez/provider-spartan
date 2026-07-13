import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CursorCliLocator } from "./cursor-cli-locator.js";

const tempDirectories: string[] = [];

async function createExecutable(filename: string, contents: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-cli-locator-"));
  tempDirectories.push(directory);
  const fullPath = path.join(directory, filename);
  await fs.writeFile(fullPath, contents, { mode: 0o755 });
  await fs.chmod(fullPath, 0o755);
  return { directory, fullPath };
}

describe("CursorCliLocator", () => {
  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    }));
  });

  it("prefers explicit CURSOR_CLI_PATH", async () => {
    const { fullPath } = await createExecutable(
      "cursor-custom",
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"Cursor CLI 1.2.3\"; elif [ \"$1\" = \"--help\" ]; then echo \"Cursor help\"; fi\n",
    );

    const locator = new CursorCliLocator({
      explicitPath: fullPath,
      env: { PATH: "" },
    });

    const result = await locator.locate();
    expect(result.installed).toBe(true);
    if (result.installed) {
      expect(result.executablePath).toBe(fullPath);
      expect(result.executableName).toBe("custom");
    }
  });

  it("accepts PATH agent only when output looks cursor-owned", async () => {
    const { directory, fullPath } = await createExecutable(
      "agent",
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"Cursor Agent 0.9.0\"; elif [ \"$1\" = \"--help\" ]; then echo \"Cursor command line\"; fi\n",
    );

    const locator = new CursorCliLocator({
      env: { PATH: directory },
    });

    const result = await locator.locate();
    expect(result.installed).toBe(true);
    if (result.installed) {
      expect(result.executableName).toBe("agent");
      expect(result.executablePath).toBe(fullPath);
    }
  });

  it("rejects generic PATH agent that does not look cursor-owned", async () => {
    const { directory } = await createExecutable(
      "agent",
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"Generic Agent 0.1\"; elif [ \"$1\" = \"--help\" ]; then echo \"generic command line\"; fi\n",
    );

    const locator = new CursorCliLocator({
      env: { PATH: directory },
      fallbackLocations: [],
    });

    const result = await locator.locate();
    expect(result.installed).toBe(false);
  });
});
