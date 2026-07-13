import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
};

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 321;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child;
}

describe("NodeClaudeCliRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("kills the process tree with SIGTERM and SIGKILL on timeout", async () => {
    const { NodeClaudeCliRunner } = await import("./claude-cli-runner.js");
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);
    const runner = new NodeClaudeCliRunner("claude");

    const promise = runner.run(["-p", "hola"], { timeoutMs: 25 });
    const rejection = expect(promise).rejects.toMatchObject({ code: "ETIMEDOUT" });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(killSpy).toHaveBeenNthCalledWith(1, -321, "SIGTERM");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(killSpy).toHaveBeenNthCalledWith(2, -321, "SIGKILL");
  });

  it("kills the process tree on abort and clears escalation after close", async () => {
    const { NodeClaudeCliRunner } = await import("./claude-cli-runner.js");
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);
    const runner = new NodeClaudeCliRunner("claude");
    const controller = new AbortController();

    const promise = runner.run(["-p", "hola"], { timeoutMs: 1_000, signal: controller.signal });
    const rejection = expect(promise).rejects.toMatchObject({ code: "ABORT_ERR" });
    controller.abort(new Error("Client disconnected"));

    await rejection;
    expect(killSpy).toHaveBeenNthCalledWith(1, -321, "SIGTERM");

    child.exitCode = 1;
    child.emit("close", 1, "SIGTERM");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(killSpy).toHaveBeenCalledTimes(1);
  });
});
