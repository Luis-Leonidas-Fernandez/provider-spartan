import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("claude setup-token runtime adapter boundary", () => {
  it("does not import repositories, cipher ports, or read ~/.claude directly", () => {
    const file = path.resolve(process.cwd(), "src/integrations/provider-adapters/claude-code-setup-token-runtime-adapter.ts");
    const content = fs.readFileSync(file, "utf8");
    const imports = content
      .split("\n")
      .filter((line) => line.trim().startsWith("import "))
      .join("\n");

    expect(imports).not.toMatch(/credential-cipher/i);
    expect(imports).not.toMatch(/provider-connection/i);
    expect(content).not.toMatch(/~\/\.claude/);
    expect(content).not.toMatch(/keychain/i);
    expect(content).not.toMatch(/cookies?/i);
  });
});
