import { afterEach, describe, expect, it, vi } from "vitest";
import { AntigravityAuthFlowManager } from "./antigravity-auth-flow-manager.js";
import type { AntigravityInteractiveProcess } from "./antigravity-auth.types.js";

function createFakeProcess() {
  let stdoutListener: ((chunk: string) => void) | null = null;
  let stderrListener: ((chunk: string) => void) | null = null;
  let exitListener: ((input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  let errorListener: ((error: Error) => void) | null = null;
  const writes: string[] = [];
  const kills: Array<NodeJS.Signals | undefined> = [];

  const process: AntigravityInteractiveProcess = {
    write(input: string) {
      writes.push(input);
    },
    end() {},
    kill(signal?: NodeJS.Signals) {
      kills.push(signal);
    },
    onStdout(listener) {
      stdoutListener = listener;
    },
    onStderr(listener) {
      stderrListener = listener;
    },
    onExit(listener) {
      exitListener = listener;
    },
    onError(listener) {
      errorListener = listener;
    },
  };

  return {
    process,
    writes,
    kills,
    emitStdout(text: string) {
      stdoutListener?.(text);
    },
    emitStderr(text: string) {
      stderrListener?.(text);
    },
    emitExit(exitCode = 0, signal: NodeJS.Signals | null = null) {
      exitListener?.({ exitCode, signal });
    },
    emitError(message: string) {
      errorListener?.(new Error(message));
    },
  };
}

describe("AntigravityAuthFlowManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("starts a flow and captures output/url/input-required events", async () => {
    const fake = createFakeProcess();
    const manager = new AntigravityAuthFlowManager(
      {
        launch: vi.fn(async () => fake.process),
      },
      {
        inspect: vi.fn(async () => ({
          provider: "antigravity" as const,
          executionMode: "local-cli" as const,
          state: "authentication_required" as const,
          cli: { installed: true, path: "/usr/local/bin/agy", version: "agy 1.2.3", searchedLocations: [] },
          authentication: { authenticated: false },
          capabilities: null,
          actions: [],
          message: "auth required",
        })),
      },
    );

    const flow = await manager.start();
    fake.emitStdout("Open https://example.com/login?code=secret and paste verification code:");

    const snapshot = manager.get(flow.flowId);
    expect(snapshot?.events).toEqual(expect.arrayContaining([
      { type: "started", flowId: flow.flowId },
      expect.objectContaining({ type: "output", stream: "stdout" }),
      expect.objectContaining({ type: "open_url" }),
      expect.objectContaining({ type: "input_required", inputType: "code" }),
    ]));
  });

  it("writes input and cancels a running flow", async () => {
    const fake = createFakeProcess();
    const manager = new AntigravityAuthFlowManager(
      { launch: vi.fn(async () => fake.process) },
      {
        inspect: vi.fn(async () => ({
          provider: "antigravity" as const,
          executionMode: "local-cli" as const,
          state: "authentication_required" as const,
          cli: { installed: true, path: "/usr/local/bin/agy", version: "agy 1.2.3", searchedLocations: [] },
          authentication: { authenticated: false },
          capabilities: null,
          actions: [],
          message: "auth required",
        })),
      },
      { cancelKillAfterMs: 10 },
    );

    const flow = await manager.start();
    await manager.writeInput(flow.flowId, "123456");
    expect(fake.writes).toEqual(["123456\n"]);

    const cancelled = await manager.cancel(flow.flowId);
    expect(cancelled.status).toBe("cancelled");
    expect(fake.kills[0]).toBe("SIGTERM");
  });

  it("marks the flow authenticated when the post-exit CLI status becomes ready", async () => {
    const fake = createFakeProcess();
    const manager = new AntigravityAuthFlowManager(
      { launch: vi.fn(async () => fake.process) },
      {
        inspect: vi.fn(async () => ({
          provider: "antigravity" as const,
          executionMode: "local-cli" as const,
          state: "ready" as const,
          cli: { installed: true, path: "/usr/local/bin/agy", version: "agy 1.2.3", searchedLocations: [] },
          authentication: { authenticated: true },
          capabilities: null,
          actions: [],
          message: "ready",
        })),
      },
    );

    const flow = await manager.start();
    fake.emitExit(0, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = manager.get(flow.flowId);
    expect(snapshot?.status).toBe("authenticated");
    expect(snapshot?.events.at(-1)).toEqual({ type: "authenticated" });
  });

  it("expires and kills stale auth flows", async () => {
    vi.useFakeTimers();
    const fake = createFakeProcess();
    const manager = new AntigravityAuthFlowManager(
      { launch: vi.fn(async () => fake.process) },
      {
        inspect: vi.fn(async () => ({
          provider: "antigravity" as const,
          executionMode: "local-cli" as const,
          state: "authentication_required" as const,
          cli: { installed: true, path: "/usr/local/bin/agy", version: "agy 1.2.3", searchedLocations: [] },
          authentication: { authenticated: false },
          capabilities: null,
          actions: [],
          message: "auth required",
        })),
      },
      { flowTimeoutMs: 50, flowTtlMs: 50 },
    );

    const flow = await manager.start();
    await vi.advanceTimersByTimeAsync(51);

    const snapshot = manager.get(flow.flowId);
    expect(snapshot?.status).toBe("failed");
    expect(snapshot?.events).toEqual(expect.arrayContaining([
      { type: "expired" },
      expect.objectContaining({ type: "failed", code: "AUTH_FLOW_EXPIRED" }),
    ]));
    expect(fake.kills[0]).toBe("SIGTERM");
  });
});
