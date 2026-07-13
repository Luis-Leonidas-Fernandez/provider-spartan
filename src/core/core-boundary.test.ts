import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function listFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("core boundary", () => {
  it("does not import Fastify from src/core", () => {
    const coreDir = path.resolve(process.cwd(), "src/core");
    const files = listFiles(coreDir);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/from\s+["']fastify["']/);
    }
  });
});
