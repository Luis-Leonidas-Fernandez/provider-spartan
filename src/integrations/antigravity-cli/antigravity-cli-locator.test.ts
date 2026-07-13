import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AntigravityCliLocator } from "./antigravity-cli-locator.js";

describe("AntigravityCliLocator", () => {
  it("finds an explicit executable path and reads its version", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-locator-"));
    const binPath = path.join(tempDir, "agy");
    await fs.writeFile(binPath, "#!/bin/sh\necho 'agy 9.9.9'\n", { mode: 0o755 });

    const locator = new AntigravityCliLocator({
      explicitPath: binPath,
      env: {},
      fallbackLocations: [],
    });

    await expect(locator.locate()).resolves.toMatchObject({
      installed: true,
      executablePath: binPath,
      version: "agy 9.9.9",
    });
  });
});
