import { createLocalCliRuntimeFailure } from "./local-cli-errors.js";

type QueuedTask<T> = {
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  controller: AbortController;
  externalSignal?: AbortSignal | undefined;
  timeout: NodeJS.Timeout | null;
};

export type LocalCliProcessSupervisorOptions = {
  maxConcurrent?: number;
  maxQueueSize?: number;
  timeoutMs?: number;
};

export class LocalCliProcessSupervisor {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly timeoutMs: number | null;
  private activeCount = 0;
  private readonly active = new Set<AbortController>();
  private readonly queue: Array<QueuedTask<unknown>> = [];

  constructor(options?: LocalCliProcessSupervisorOptions) {
    this.maxConcurrent = Math.max(1, options?.maxConcurrent ?? 2);
    this.maxQueueSize = Math.max(0, options?.maxQueueSize ?? 20);
    this.timeoutMs = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : null;
  }

  getSnapshot() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
    };
  }

  async run<T>(run: (signal: AbortSignal) => Promise<T>, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T> {
    if (this.activeCount >= this.maxConcurrent && this.maxQueueSize === 0) {
      throw createLocalCliRuntimeFailure("PROVIDER_BUSY", "Local CLI provider is busy and queueing is disabled");
    }
    if (this.queue.length >= this.maxQueueSize && this.activeCount >= this.maxConcurrent) {
      throw createLocalCliRuntimeFailure("QUEUE_FULL", "Local CLI process queue is full");
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    let timeout: NodeJS.Timeout | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timeout = setTimeout(() => controller.abort(new Error(`Local CLI process timed out after ${timeoutMs}ms`)), timeoutMs);
      timeout.unref();
    }

    if (options?.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else options.signal.addEventListener("abort", () => controller.abort(options.signal?.reason), { once: true });
    }

    return await new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = { run, resolve, reject, controller, externalSignal: options?.signal, timeout };
      this.queue.push(task as QueuedTask<unknown>);
      this.drain();
    });
  }

  cancelAll(reason = "Local CLI supervisor shutdown") {
    for (const task of this.queue.splice(0)) {
      if (task.timeout) clearTimeout(task.timeout);
      task.controller.abort(new Error(reason));
      task.reject(new Error(reason));
    }
    for (const controller of this.active) {
      controller.abort(new Error(reason));
    }
  }

  private drain() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) return;
      this.activeCount += 1;
      this.active.add(task.controller);
      void task.run(task.controller.signal)
        .then((value) => task.resolve(value))
        .catch((error) => task.reject(error))
        .finally(() => {
          if (task.timeout) clearTimeout(task.timeout);
          this.active.delete(task.controller);
          this.activeCount -= 1;
          this.drain();
        });
    }
  }
}
