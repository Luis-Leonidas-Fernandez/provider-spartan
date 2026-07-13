export type CursorRequestAuditEvent = {
  providerId: string;
  phase:
    | "test_connection_success"
    | "test_connection_failed"
    | "test_message_success"
    | "test_message_failed"
    | "test_message_cancelled"
    | "test_message_rejected"
    | "models_discovery_success"
    | "models_discovery_failed";
  occurredAt: string;
  data: Record<string, unknown>;
};

export interface CursorRequestAuditRecorderPort {
  record(event: CursorRequestAuditEvent): Promise<void>;
}
