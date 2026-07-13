const DEFAULT_KILL_GRACE_MS = 1_000;

export type KillableChildProcess = {
  pid?: number | undefined;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
};

function isRunning(processHandle: KillableChildProcess) {
  return processHandle.exitCode === null && processHandle.signalCode === null;
}

export function sendSignalToProcessTree(
  processHandle: KillableChildProcess,
  signal: NodeJS.Signals,
  killFn: typeof process.kill = process.kill,
) {
  if (process.platform !== "win32" && processHandle.pid && processHandle.pid > 0) {
    try {
      killFn(-processHandle.pid, signal);
      return;
    } catch {
      // fallback to direct child kill below
    }
  }

  processHandle.kill(signal);
}

export function terminateProcessTree(
  processHandle: KillableChildProcess,
  options?: {
    graceMs?: number;
    killFn?: typeof process.kill;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
  },
) {
  const graceMs = options?.graceMs ?? DEFAULT_KILL_GRACE_MS;
  const killFn = options?.killFn ?? process.kill;
  const setTimeoutFn = options?.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options?.clearTimeoutFn ?? clearTimeout;

  sendSignalToProcessTree(processHandle, "SIGTERM", killFn);

  const escalationTimer = setTimeoutFn(() => {
    if (!isRunning(processHandle)) return;
    sendSignalToProcessTree(processHandle, "SIGKILL", killFn);
  }, graceMs);
  escalationTimer.unref?.();

  return () => {
    clearTimeoutFn(escalationTimer);
  };
}
