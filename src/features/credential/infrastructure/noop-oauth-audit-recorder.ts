import type { OAuthAuditEvent, OAuthAuditRecorderPort } from "../application/ports/oauth-audit-recorder.port.js";

export class NoopOAuthAuditRecorder implements OAuthAuditRecorderPort {
  async record(_event: OAuthAuditEvent) {
    // Intentionally empty. Used when auth auditing is disabled.
  }
}
