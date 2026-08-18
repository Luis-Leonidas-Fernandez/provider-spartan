export type ProviderRequestAbortSource = "external" | "timeout" | null;

export function createProviderRequestAbortScope(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let source: ProviderRequestAbortSource = null;

  const abortFromExternal = () => {
    if (controller.signal.aborted) return;
    source = "external";
    controller.abort(externalSignal?.reason ?? new Error("Client disconnected"));
  };

  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timeout = setTimeout(() => {
    if (controller.signal.aborted) return;
    source = "timeout";
    controller.abort(new Error(`Provider request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  timeout.unref();

  return {
    signal: controller.signal,
    getSource: () => source,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}
