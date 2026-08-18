import { describe, expect, it, vi } from "vitest";
import {
  emitGatewayEventBestEffort,
  runGatewayObservabilityBestEffort,
} from "../application/services/best-effort-gateway-observability.js";

describe("best-effort gateway observability", () => {
  it("settles every telemetry task without propagating failures", async () => {
    const successfulTask = vi.fn().mockResolvedValue(undefined);
    const failedTask = vi.fn().mockRejectedValue(new Error("telemetry unavailable"));

    await expect(runGatewayObservabilityBestEffort([
      successfulTask,
      failedTask,
    ])).resolves.toBeUndefined();

    expect(successfulTask).toHaveBeenCalledOnce();
    expect(failedTask).toHaveBeenCalledOnce();
  });

  it("does not let an event listener failure invalidate the operation", () => {
    const eventBus = {
      emit: vi.fn(() => {
        throw new Error("listener failed");
      }),
      subscribe: vi.fn(),
    };

    expect(() => emitGatewayEventBestEffort(eventBus, {
      type: "request.completed",
      data: { requestId: "request-1" },
    })).not.toThrow();
  });
});
