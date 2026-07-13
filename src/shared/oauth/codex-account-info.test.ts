import { describe, expect, it } from "vitest";
import { decodeJwtPayload, extractCodexAccountInfo } from "./codex-account-info.js";

function createJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("extractCodexAccountInfo", () => {
  it("extracts codex account metadata from jwt claims", () => {
    const token = createJwt({
      email: "luis@example.com",
      exp: 1_700_000_000,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "ws_123",
        chatgpt_plan_type: "plus",
      },
    });

    expect(extractCodexAccountInfo(token)).toEqual({
      accountEmail: "luis@example.com",
      chatgptAccountId: "ws_123",
      chatgptPlanType: "plus",
      jwtExp: 1_700_000_000,
    });
  });

  it("returns empty metadata for invalid jwt", () => {
    expect(extractCodexAccountInfo("not-a-jwt")).toEqual({});
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });
});
