import type { GeminiCliRunner, GeminiCliRunnerOptions, GeminiCliRunnerResult } from "./gemini-runtime.js";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";

export class SupervisedGeminiCliRunner implements GeminiCliRunner {
  constructor(
    private readonly runner: GeminiCliRunner,
    private readonly supervisor: LocalCliProcessSupervisor,
  ) {}

  async run(args: string[], options: GeminiCliRunnerOptions): Promise<GeminiCliRunnerResult> {
    return await this.supervisor.run(
      async (signal) => await this.runner.run(args, {
        ...options,
        signal,
      }),
      options.signal ? { signal: options.signal } : undefined,
    );
  }
}
