export type CursorConcurrencySnapshot = {
  activeCount: number;
  queuedCount: number;
  maxConcurrent: number;
  maxQueueSize: number;
};

export interface CursorConcurrencyInspectorPort {
  getSnapshot(): CursorConcurrencySnapshot;
}
