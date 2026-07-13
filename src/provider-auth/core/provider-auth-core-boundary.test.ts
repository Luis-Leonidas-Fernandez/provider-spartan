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

function extractImports(content: string) {
  return content
    .split("\n")
    .filter((line) => line.trim().startsWith("import "))
    .join("\n");
}

describe("provider-auth core boundary", () => {
  it("does not import Fastify from src/provider-auth/core", () => {
    const coreDir = path.resolve(process.cwd(), "src/provider-auth/core");
    const files = listFiles(coreDir);
    for (const file of files) {
      const imports = extractImports(fs.readFileSync(file, "utf8"));
      expect(imports).not.toMatch(/from\s+["']fastify["']/);
    }
  });

  it("does not import provider-specific Codex code from src/provider-auth/core", () => {
    const coreDir = path.resolve(process.cwd(), "src/provider-auth/core");
    const files = listFiles(coreDir).filter((file) => !file.endsWith("provider-auth-core-boundary.test.ts"));
    const forbiddenPatterns = [
      /provider-auth\/providers\/codex/,
      /codex-metadata/,
      /codex-oauth-client/,
      /CodexAuthStrategy/,
    ];

    for (const file of files) {
      const imports = extractImports(fs.readFileSync(file, "utf8"));
      for (const pattern of forbiddenPatterns) {
        expect(imports).not.toMatch(pattern);
      }
    }
  });
});
