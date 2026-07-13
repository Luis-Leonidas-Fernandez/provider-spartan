export type CodexRequestAuditEvent = {
  providerId: string;
  phase: "test_message_success" | "test_message_failed";
  occurredAt: string;
  data: Record<string, unknown>;
};

export interface CodexRequestAuditRecorderPort {
  record(event: CodexRequestAuditEvent): Promise<void>;
}
