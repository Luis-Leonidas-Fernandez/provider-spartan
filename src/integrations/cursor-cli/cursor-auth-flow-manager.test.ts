import { afterEach, describe, expect, it, vi } from "vitest";
import { CursorAuthFlowManager } from "./cursor-auth-flow-manager.js";
import type { CursorInteractiveProcess } from "./cursor-auth.types.js";

function createFakeProcess() {
  let stdoutListener: ((chunk: string) => void) | null = null;
  let stderrListener: ((chunk: string) => void) | null = null;
  let exitListener: ((input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  let errorListener: ((error: Error) => void) | null = null;
  const writes: string[] = [];
  const kills: Array<NodeJS.Signals | undefined> = [];

  const process: CursorInteractiveProcess = {
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

describe("CursorAuthFlowManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a flow and captures output/url/input-required events", async () => {
    const fake = createFakeProcess();
    const manager = new CursorAuthFlowManager(
      { launch: vi.fn(async () => fake.process) },
      {
        inspect: vi.fn(async () => ({
          provider: "cursor-cli-subscription" as const,
          executionMode: "local-cli" as const,
          state: "authentication_required" as const,
          cli: {
            installed: true,
            executable: "agent" as const,
            path: "/usr/local/bin/agent",
            version: "Cursor CLI 1.0.0",
            searchedCandidates: ["agent"],
            searchedLocations: ["/usr/local/bin/agent"],
          },
          authentication: { authenticated: false, method: "cursor-account" as const },
          capabilities: null,
          actions: [],
          message: "auth required",
        })),
      },
      {
        inspect: vi.fn(async () => ({
          supportsLogin: true,
          supportsStatus: true,
          supportsStatusJson: true,
          supportsLogout: true,
          supportsModelListing: true,
          supportsModelArgument: true,
          supportsPrintMode: true,
          supportsStdinPrompt: true,
          supportsJsonOutput: true,
          supportsStreamJsonOutput: false,
          supportsPartialStreaming: false,
          supportsWorkspaceArgument: false,
          supportsSessionResume: false,
          supportsNoBrowserLogin: true,
          supportsTrustArgument: false,
          supportsForceArgument: false,
          detectedArguments: ["--no-browser"],
        })),
      },
    );

    const flow = await manager.start();
    fake.emitStdout("Open https://example.com/login?code=secret and paste device code:");

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
    const manager = new CursorAuthFlowManager(
      { launch: vi.fn(async () => fake.process) },
      { inspect: vi.fn(async () => ({ state: "authentication_required", message: "auth required" } as never)) },
      { inspect: vi.fn(async () => null) },
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
    const manager = new CursorAuthFlowManager(
      { launch: vi.fn(async () => fake.process) },
      { inspect: vi.fn(async () => ({ state: "ready", message: "ready" } as never)) },
      { inspect: vi.fn(async () => null) },
    );

    const flow = await manager.start();
    fake.emitExit(0, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = manager.get(flow.flowId);
    expect(snapshot?.status).toBe("authenticated");
    expect(snapshot?.events.at(-1)).toEqual({ type: "authenticated" });
  });
});
