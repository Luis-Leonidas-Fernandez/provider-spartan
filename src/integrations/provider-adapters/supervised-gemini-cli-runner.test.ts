import { describe, expect, it, vi } from "vitest";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";
import { SupervisedGeminiCliRunner } from "./supervised-gemini-cli-runner.js";
import type { GeminiCliRunnerResult } from "./gemini-runtime.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SupervisedGeminiCliRunner", () => {
  it("rejects new executions when the Gemini provider is busy and queueing is disabled", async () => {
    const first = deferred<GeminiCliRunnerResult>();
    const baseRunner = {
      run: vi.fn(async () => await first.promise),
    };
    const runner = new SupervisedGeminiCliRunner(
      baseRunner,
      new LocalCliProcessSupervisor({ maxConcurrent: 1, maxQueueSize: 0 }),
    );

    const firstRun = runner.run(["--model", "pro", "--print", "hola"], { timeoutMs: 1_000 });
    await vi.waitFor(() => expect(baseRunner.run).toHaveBeenCalledTimes(1));

    await expect(
      runner.run(["--model", "flash", "--print", "segundo"], { timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "PROVIDER_BUSY" });

    first.resolve({ exitCode: 0, stdout: "ok", stderr: "", timedOut: false, signal: null });
    await expect(firstRun).resolves.toMatchObject({ exitCode: 0 });
  });
});
