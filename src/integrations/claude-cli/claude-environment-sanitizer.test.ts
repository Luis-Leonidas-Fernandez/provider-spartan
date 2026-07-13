import { describe, expect, it } from "vitest";
import { sanitizeClaudeSubscriptionEnvironment } from "./claude-environment-sanitizer.js";

describe("sanitizeClaudeSubscriptionEnvironment", () => {
  it("removes API/broker env vars but preserves the injected setup token", () => {
    const result = sanitizeClaudeSubscriptionEnvironment(
      {
        PATH: "/usr/bin",
        ANTHROPIC_API_KEY: "secret-api-key",
        ANTHROPIC_BASE_URL: "https://example.com",
        CLAUDE_CODE_USE_BEDROCK: "true",
      },
      {
        CLAUDE_CODE_OAUTH_TOKEN: "setup-token",
      },
    );

    expect(result.childEnv.PATH).toBe("/usr/bin");
    expect(result.childEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe("setup-token");
    expect(result.childEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.childEnv.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(result.childEnv.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    expect(result.removedKeys).toEqual(expect.arrayContaining([
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_BASE_URL",
      "CLAUDE_CODE_USE_BEDROCK",
    ]));
  });
});
