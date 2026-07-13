import type { CodexRequestAuditEvent, CodexRequestAuditRecorderPort } from "../application/ports/codex-request-audit-recorder.port.js";

export class NoopCodexRequestAuditRecorder implements CodexRequestAuditRecorderPort {
  async record(_event: CodexRequestAuditEvent) {}
}
