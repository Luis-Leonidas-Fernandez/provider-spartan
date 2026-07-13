import type { CursorRequestAuditEvent, CursorRequestAuditRecorderPort } from "../application/ports/cursor-request-audit-recorder.port.js";

export class NoopCursorRequestAuditRecorder implements CursorRequestAuditRecorderPort {
  async record(_event: CursorRequestAuditEvent) {}
}
