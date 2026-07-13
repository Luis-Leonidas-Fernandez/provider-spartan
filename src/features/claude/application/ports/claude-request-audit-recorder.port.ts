export type ClaudeRequestAuditEvent = {
  providerId: string;
  phase:
    | "connect_instructions"
    | "import_token_success"
    | "test_connection_success"
    | "test_connection_failed"
    | "test_message_success"
    | "test_message_failed"
    | "test_message_cancelled"
    | "test_message_rejected"
    | "models_discovery_success";
  occurredAt: string;
  data: Record<string, unknown>;
};

export interface ClaudeRequestAuditRecorderPort {
  record(event: ClaudeRequestAuditEvent): Promise<void>;
}
