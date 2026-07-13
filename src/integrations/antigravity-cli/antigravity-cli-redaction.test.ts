import { describe, expect, it } from "vitest";
import { redactAntigravityCliOutput } from "./antigravity-cli-redaction.js";

describe("redactAntigravityCliOutput", () => {
  it("redacts bearer tokens and OAuth codes in URLs", () => {
    const value = redactAntigravityCliOutput(
      'Open https://example.com/callback?code=abc123&state=test and use Authorization: Bearer secret-token',
    );

    expect(value).toContain("code=%5BREDACTED%5D");
    expect(value).toContain("Authorization: [REDACTED] [REDACTED]");
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("secret-token");
  });
});
