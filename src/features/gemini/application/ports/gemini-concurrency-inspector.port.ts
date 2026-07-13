export type GeminiConcurrencySnapshot = {
  activeCount: number;
  queuedCount: number;
  maxConcurrent: number;
  maxQueueSize: number;
};

export interface GeminiConcurrencyInspectorPort {
  getSnapshot(): GeminiConcurrencySnapshot;
}
