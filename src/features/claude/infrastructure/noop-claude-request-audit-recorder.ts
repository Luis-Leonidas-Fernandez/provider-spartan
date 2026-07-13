import type { ClaudeRequestAuditEvent, ClaudeRequestAuditRecorderPort } from "../application/ports/claude-request-audit-recorder.port.js";

export class NoopClaudeRequestAuditRecorder implements ClaudeRequestAuditRecorderPort {
  async record(_event: ClaudeRequestAuditEvent) {}
}
