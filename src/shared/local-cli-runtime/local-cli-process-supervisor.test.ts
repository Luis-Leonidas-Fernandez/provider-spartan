import { describe, expect, it, vi } from "vitest";
import { LocalCliProcessSupervisor } from "./local-cli-process-supervisor.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LocalCliProcessSupervisor", () => {
  it("limits concurrent local CLI tasks and queues the rest", async () => {
    const supervisor = new LocalCliProcessSupervisor({ maxConcurrent: 1, maxQueueSize: 2 });
    const first = deferred<string>();
    const second = deferred<string>();
    const started: string[] = [];

    const firstRun = supervisor.run(async () => {
      started.push("first");
      return await first.promise;
    });
    const secondRun = supervisor.run(async () => {
      started.push("second");
      return await second.promise;
    });

    await vi.waitFor(() => expect(started).toEqual(["first"]));
    expect(supervisor.getSnapshot()).toMatchObject({ activeCount: 1, queuedCount: 1 });

    first.resolve("one");
    await expect(firstRun).resolves.toBe("one");
    await vi.waitFor(() => expect(started).toEqual(["first", "second"]));
    second.resolve("two");
    await expect(secondRun).resolves.toBe("two");
  });

  it("cancels queued and active tasks on shutdown", async () => {
    const supervisor = new LocalCliProcessSupervisor({ maxConcurrent: 1, maxQueueSize: 2 });
    const first = deferred<string>();
    const firstRun = supervisor.run(async (signal) => {
      signal.addEventListener("abort", () => first.reject(new Error("aborted")), { once: true });
      return await first.promise;
    });
    const secondRun = supervisor.run(async () => "second");

    await vi.waitFor(() => expect(supervisor.getSnapshot()).toMatchObject({ activeCount: 1, queuedCount: 1 }));
    supervisor.cancelAll("shutdown");

    await expect(firstRun).rejects.toThrow("aborted");
    await expect(secondRun).rejects.toThrow("shutdown");
  });

  it("distinguishes provider busy from queue full", async () => {
    const busySupervisor = new LocalCliProcessSupervisor({ maxConcurrent: 1, maxQueueSize: 0 });
    const first = deferred<string>();
    const firstRun = busySupervisor.run(async () => await first.promise);
    await expect(busySupervisor.run(async () => "second")).rejects.toMatchObject({ code: "PROVIDER_BUSY" });
    first.resolve("done");
    await expect(firstRun).resolves.toBe("done");

    const queuedSupervisor = new LocalCliProcessSupervisor({ maxConcurrent: 1, maxQueueSize: 1 });
    const active = deferred<string>();
    const queued = deferred<string>();
    const activeRun = queuedSupervisor.run(async () => await active.promise);
    const queuedRun = queuedSupervisor.run(async () => await queued.promise);
    await expect(queuedSupervisor.run(async () => "third")).rejects.toMatchObject({ code: "QUEUE_FULL" });
    active.resolve("active");
    queued.resolve("queued");
    await expect(activeRun).resolves.toBe("active");
    await expect(queuedRun).resolves.toBe("queued");
  });
});
