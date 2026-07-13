import { describe, expect, it, vi } from "vitest";
import { terminateProcessTree, type KillableChildProcess } from "./local-cli-process-tree.js";

function createProcessHandle(overrides?: Partial<KillableChildProcess>): KillableChildProcess {
  return {
    pid: 12345,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => true),
    ...overrides,
  };
}

describe("terminateProcessTree", () => {
  it("sends SIGTERM and escalates to SIGKILL when the process stays running", () => {
    vi.useFakeTimers();
    const killFn = vi.fn();
    const processHandle = createProcessHandle();

    terminateProcessTree(processHandle, { graceMs: 25, killFn });
    expect(killFn).toHaveBeenNthCalledWith(1, -12345, "SIGTERM");

    vi.advanceTimersByTime(25);
    expect(killFn).toHaveBeenNthCalledWith(2, -12345, "SIGKILL");
    vi.useRealTimers();
  });

  it("does not escalate after the process exits before grace time", () => {
    vi.useFakeTimers();
    const killFn = vi.fn();
    const processHandle = createProcessHandle();

    const cleanup = terminateProcessTree(processHandle, { graceMs: 25, killFn });
    processHandle.exitCode = 0;
    cleanup();
    vi.advanceTimersByTime(25);

    expect(killFn).toHaveBeenCalledTimes(1);
    expect(killFn).toHaveBeenCalledWith(-12345, "SIGTERM");
    vi.useRealTimers();
  });
});
