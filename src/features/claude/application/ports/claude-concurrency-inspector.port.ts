export type ClaudeConcurrencySnapshot = {
  activeCount: number;
  queuedCount: number;
  maxConcurrent: number;
  maxQueueSize: number;
};

export interface ClaudeConcurrencyInspectorPort {
  getSnapshot(): ClaudeConcurrencySnapshot;
}
