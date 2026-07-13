import { describe, expect, it } from "vitest";
import { buildRequestMetadata, buildResponseMetadata, sanitizeErrorMessage } from "../application/sanitize-request-log-metadata.js";

describe("request log sanitization", () => {
  it("redacts bearer tokens from errors", () => {
    expect(sanitizeErrorMessage("upstream said Bearer secret-token-123 failed")).toContain("[REDACTED]");
  });

  it("stores only safe metadata", () => {
    const request = buildRequestMetadata({
      model: "minimax/MiniMax-M3",
      provider: "minimax",
      appClientId: "app_1",
      messageCount: 2,
      requestSizeApprox: 120,
      usageSource: "estimated",
    });
    const response = buildResponseMetadata({
      providerRequestId: "req_123",
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      responseSizeApprox: 40,
      status: "success",
    });

    expect(JSON.stringify(request)).not.toContain("Hola secreto");
    expect(JSON.stringify(response)).not.toContain("respuesta completa");
    expect(request).toEqual(expect.objectContaining({ model: "minimax/MiniMax-M3", messageCount: 2 }));
  });
});
