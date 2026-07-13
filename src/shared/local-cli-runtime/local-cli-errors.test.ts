import { describe, expect, it } from "vitest";
import { classifyLocalCliFailure } from "./local-cli-errors.js";

describe("classifyLocalCliFailure", () => {
  it("normalizes quota and rate limit messages", () => {
    expect(classifyLocalCliFailure("RESOURCE_EXHAUSTED quota exceeded")).toMatchObject({ code: "QUOTA_EXHAUSTED" });
    expect(classifyLocalCliFailure("429 too many requests rate limit")).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("normalizes auth and timeout messages", () => {
    expect(classifyLocalCliFailure("Please login before continuing")).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(classifyLocalCliFailure("process timed out after 100ms")).toMatchObject({ code: "PROCESS_TIMEOUT" });
  });

  it("normalizes saturation and cancellation messages", () => {
    expect(classifyLocalCliFailure("Local CLI provider is busy and queueing is disabled")).toMatchObject({ code: "PROVIDER_BUSY" });
    expect(classifyLocalCliFailure("Local CLI process queue is full")).toMatchObject({ code: "QUEUE_FULL" });
    expect(classifyLocalCliFailure("Client disconnected")).toMatchObject({ code: "PROCESS_CANCELLED" });
  });
});
