import fs from "node:fs/promises";
import path from "node:path";
import type { CursorRequestAuditEvent, CursorRequestAuditRecorderPort } from "../application/ports/cursor-request-audit-recorder.port.js";

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function auditFilename(event: CursorRequestAuditEvent) {
  const timestamp = event.occurredAt.replace(/[:.]/g, "-");
  return `${timestamp}_${safeSegment(event.providerId)}_${event.phase}.json`;
}

export class FileCursorRequestAuditRecorder implements CursorRequestAuditRecorderPort {
  constructor(private readonly directory: string) {}

  async record(event: CursorRequestAuditEvent) {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(
      path.join(this.directory, auditFilename(event)),
      `${JSON.stringify(event, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
}
