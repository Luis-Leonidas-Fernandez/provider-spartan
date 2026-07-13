import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
};

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.pid = 777;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child;
}

describe("NodeAntigravityInteractiveProcessLauncher", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns antigravity auth as a detached process group", async () => {
    const { NodeAntigravityInteractiveProcessLauncher } = await import("./antigravity-auth-process.js");
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const launcher = new NodeAntigravityInteractiveProcessLauncher({
      locate: async () => ({
        installed: true,
        executablePath: "/usr/local/bin/agy",
        version: "1.0.0",
        searchedLocations: [],
      }),
    });

    await launcher.launch({ args: ["auth", "login"] });

    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/local/bin/agy",
      expect.arrayContaining(["auth", "login"]),
      expect.objectContaining({
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
      }),
    );
  });

  it("kills the antigravity auth process tree instead of only the direct child", async () => {
    const { NodeAntigravityInteractiveProcessLauncher } = await import("./antigravity-auth-process.js");
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);
    const launcher = new NodeAntigravityInteractiveProcessLauncher({
      locate: async () => ({
        installed: true,
        executablePath: "/usr/local/bin/agy",
        version: "1.0.0",
        searchedLocations: [],
      }),
    });

    const processHandle = await launcher.launch({ args: ["auth", "login"] });
    processHandle.kill("SIGTERM");
    processHandle.kill("SIGKILL");

    expect(killSpy).toHaveBeenNthCalledWith(1, -777, "SIGTERM");
    expect(killSpy).toHaveBeenNthCalledWith(2, -777, "SIGKILL");
    expect(child.kill).not.toHaveBeenCalled();
  });
});
