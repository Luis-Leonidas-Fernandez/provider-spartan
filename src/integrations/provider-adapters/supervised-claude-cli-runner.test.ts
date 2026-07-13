import { describe, expect, it, vi } from "vitest";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";
import { SupervisedClaudeCliRunner } from "./supervised-claude-cli-runner.js";
import type { ClaudeCliRunnerResult } from "./claude-runtime.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SupervisedClaudeCliRunner", () => {
  it("rejects new executions when the Claude queue is saturated", async () => {
    const first = deferred<ClaudeCliRunnerResult>();
    const baseRunner = {
      run: vi.fn(async () => await first.promise),
    };
    const runner = new SupervisedClaudeCliRunner(
      baseRunner,
      new LocalCliProcessSupervisor({ maxConcurrent: 1, maxQueueSize: 0 }),
    );

    const firstRun = runner.run(["-p", "hola"], { timeoutMs: 1_000 });
    await vi.waitFor(() => expect(baseRunner.run).toHaveBeenCalledTimes(1));

    await expect(
      runner.run(["-p", "segundo"], { timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "PROVIDER_BUSY" });

    first.resolve({ exitCode: 0, stdout: "ok", stderr: "" });
    await expect(firstRun).resolves.toMatchObject({ exitCode: 0 });
  });
});
