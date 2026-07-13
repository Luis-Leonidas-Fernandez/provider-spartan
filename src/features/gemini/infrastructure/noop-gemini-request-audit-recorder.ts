import type { GeminiRequestAuditEvent, GeminiRequestAuditRecorderPort } from "../application/ports/gemini-request-audit-recorder.port.js";

export class NoopGeminiRequestAuditRecorder implements GeminiRequestAuditRecorderPort {
  async record(_event: GeminiRequestAuditEvent) {}
}
