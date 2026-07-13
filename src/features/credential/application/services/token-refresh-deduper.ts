const REFRESH_RESULT_TTL_MS = 10_000;

type RefreshCacheEntry<T> =
  | { promise: Promise<T> }
  | { result: T; expiresAt: number };

export class TokenRefreshDeduper {
  private readonly refreshDedupCache = new Map<string, RefreshCacheEntry<unknown>>();

  async run<T>(provider: string, oldToken: string | null, fn: () => Promise<T>, log?: { info?: (message: string, meta?: Record<string, unknown>) => void }) {
    if (!oldToken) return fn();

    const key = `${provider}:${oldToken}`;
    const hit = this.refreshDedupCache.get(key) as RefreshCacheEntry<T> | undefined;
    if (hit) {
      if ("promise" in hit) {
        log?.info?.("Reusing in-flight token refresh", { provider });
        return hit.promise;
      }
      if (hit.expiresAt > Date.now()) {
        log?.info?.("Reusing recent token refresh result", { provider });
        return hit.result;
      }
      this.refreshDedupCache.delete(key);
    }

    const promise = (async () => {
      try {
        const result = await fn();
        this.refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });
        return result;
      } catch (error) {
        this.refreshDedupCache.delete(key);
        throw error;
      }
    })();

    this.refreshDedupCache.set(key, { promise });
    return promise;
  }
}
