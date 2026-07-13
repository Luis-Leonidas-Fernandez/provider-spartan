import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(fullPath);
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

function importSpecifiers(content: string) {
  const specifiers: string[] = [];
  const patterns = [
    /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g,
    /export\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function offendingImports(input: {
  dir: string;
  forbidden: RegExp;
  allow?: (file: string, specifier: string) => boolean;
}) {
  return listTsFiles(input.dir).flatMap((file) => {
    const content = fs.readFileSync(file, "utf8");
    return importSpecifiers(content)
      .filter((specifier) => input.forbidden.test(specifier))
      .filter((specifier) => !input.allow?.(file, specifier))
      .map((specifier) => `${path.relative(process.cwd(), file)} -> ${specifier}`);
  });
}

describe("vertical slice boundaries", () => {
  it("keeps integrations independent from feature slices", () => {
    const offenders = offendingImports({
      dir: path.resolve(process.cwd(), "src/integrations"),
      forbidden: /features\//,
    });

    expect(offenders).toEqual([]);
  });

  it("keeps feature application/domain layers independent from integrations", () => {
    const featuresDir = path.resolve(process.cwd(), "src/features");
    const files = fs.readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => [
        path.join(featuresDir, entry.name, "application"),
        path.join(featuresDir, entry.name, "domain"),
      ]);

    const offenders = files.flatMap((dir) => offendingImports({
      dir,
      forbidden: /integrations\//,
    }));

    expect(offenders).toEqual([]);
  });
});
