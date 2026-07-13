import { describe, expect, it } from "vitest";
import { createAppSubscription } from "../domain/subscription.entity.js";

describe("createAppSubscription", () => {
  it("validates endsAt after startsAt", () => {
    expect(() => createAppSubscription({
      appClientId: "a",
      planId: "p",
      status: "active",
      startsAt: "2026-01-02T00:00:00.000Z",
      endsAt: "2026-01-01T00:00:00.000Z",
    })).toThrow("endsAt cannot be earlier than startsAt");
  });
});
