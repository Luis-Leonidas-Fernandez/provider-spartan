import fs from "node:fs/promises";
import path from "node:path";
import type { ClaudeRequestAuditEvent, ClaudeRequestAuditRecorderPort } from "../application/ports/claude-request-audit-recorder.port.js";

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function auditFilename(event: ClaudeRequestAuditEvent) {
  const timestamp = event.occurredAt.replace(/[:.]/g, "-");
  return `${timestamp}_${safeSegment(event.providerId)}_${event.phase}.json`;
}

export class FileClaudeRequestAuditRecorder implements ClaudeRequestAuditRecorderPort {
  constructor(private readonly directory: string) {}

  async record(event: ClaudeRequestAuditEvent) {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(
      path.join(this.directory, auditFilename(event)),
      `${JSON.stringify(event, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
}
