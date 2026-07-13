import type { ClaudeCliRunner, ClaudeCliRunnerOptions, ClaudeCliRunnerResult } from "./claude-runtime.js";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";

export class SupervisedClaudeCliRunner implements ClaudeCliRunner {
  constructor(
    private readonly runner: ClaudeCliRunner,
    private readonly supervisor: LocalCliProcessSupervisor,
  ) {}

  async run(args: string[], options: ClaudeCliRunnerOptions): Promise<ClaudeCliRunnerResult> {
    return await this.supervisor.run(
      async (signal) => await this.runner.run(args, {
        ...options,
        signal,
      }),
      options.signal ? { signal: options.signal } : undefined,
    );
  }
}
