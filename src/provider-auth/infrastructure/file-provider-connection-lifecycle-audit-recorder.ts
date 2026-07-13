import fs from "node:fs/promises";
import path from "node:path";
import type { ProviderConnectionLifecycleAuditEvent, ProviderConnectionLifecycleAuditPort } from "../core/ports/provider-connection-lifecycle-audit.port.js";

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function auditFilename(event: ProviderConnectionLifecycleAuditEvent) {
  const timestamp = event.occurredAt.replace(/[:.]/g, "-");
  return `${timestamp}_${safeSegment(event.providerId)}_${event.event}.json`;
}

export class FileProviderConnectionLifecycleAuditRecorder implements ProviderConnectionLifecycleAuditPort {
  constructor(private readonly directory: string) {}

  async record(event: ProviderConnectionLifecycleAuditEvent) {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(
      path.join(this.directory, auditFilename(event)),
      `${JSON.stringify(event, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
}
