import { describe, expect, it } from "vitest";
import { sanitizeCursorSubscriptionEnvironment } from "./cursor-environment-sanitizer.js";

describe("sanitizeCursorSubscriptionEnvironment", () => {
  it("removes cursor api env while preserving unrelated variables", () => {
    const result = sanitizeCursorSubscriptionEnvironment(
      {
        PATH: "/usr/bin",
        CURSOR_API_KEY: "secret",
        CURSOR_FORCE_API_MODE: "true",
      },
      {
        CUSTOM_FLAG: "ok",
      },
    );

    expect(result.childEnv.PATH).toBe("/usr/bin");
    expect(result.childEnv.CUSTOM_FLAG).toBe("ok");
    expect(result.childEnv.CURSOR_API_KEY).toBeUndefined();
    expect(result.childEnv.CURSOR_FORCE_API_MODE).toBeUndefined();
    expect(result.removedKeys).toEqual(expect.arrayContaining(["CURSOR_API_KEY", "CURSOR_FORCE_API_MODE"]));
  });
});
