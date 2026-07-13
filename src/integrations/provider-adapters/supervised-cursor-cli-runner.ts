import type { CursorCliCommandRunnerPort, CursorCliRunOptions, CursorCliRunResult } from "../cursor-cli/cursor-cli.types.js";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";

export class SupervisedCursorCliRunner implements CursorCliCommandRunnerPort {
  constructor(
    private readonly runner: CursorCliCommandRunnerPort,
    private readonly supervisor: LocalCliProcessSupervisor,
  ) {}

  async run(args: string[], options: CursorCliRunOptions): Promise<CursorCliRunResult> {
    return await this.supervisor.run(
      async (signal) => await this.runner.run(args, {
        ...options,
        signal,
      }),
      options.signal ? { signal: options.signal, timeoutMs: options.timeoutMs } : { timeoutMs: options.timeoutMs },
    );
  }
}
