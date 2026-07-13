export type CursorAuthEvent =
  | { type: "started"; flowId: string }
  | { type: "output"; text: string; stream: "stdout" | "stderr" }
  | { type: "open_url"; url: string }
  | { type: "input_required"; inputType: "code" | "text"; prompt?: string | undefined }
  | { type: "authenticated" }
  | { type: "expired" }
  | { type: "failed"; code: string; message: string }
  | { type: "cancelled" };

export type CursorAuthFlowStatus = "running" | "authenticated" | "failed" | "cancelled";

export type CursorAuthFlowSnapshot = {
  flowId: string;
  status: CursorAuthFlowStatus;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  events: CursorAuthEvent[];
};

export interface CursorAuthFlowManagerPort {
  start(): Promise<CursorAuthFlowSnapshot>;
  get(flowId: string): CursorAuthFlowSnapshot | null;
  writeInput(flowId: string, input: string): Promise<CursorAuthFlowSnapshot>;
  cancel(flowId: string): Promise<CursorAuthFlowSnapshot>;
  subscribe(flowId: string, listener: (event: CursorAuthEvent) => void): (() => void) | null;
  cleanupExpired(now?: Date): number;
  cancelAll(reason?: string): number;
}
