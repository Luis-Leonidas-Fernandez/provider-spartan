import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileProviderConnectionLifecycleAuditRecorder } from "./file-provider-connection-lifecycle-audit-recorder.js";

describe("FileProviderConnectionLifecycleAuditRecorder", () => {
  it("writes sanitized lifecycle audit events as json", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-lifecycle-audit-"));
    const recorder = new FileProviderConnectionLifecycleAuditRecorder(directory);

    await recorder.record({
      provider: "codex",
      providerId: "provider-1",
      connectionId: "connection-1",
      event: "connection_refresh_failed",
      occurredAt: "2026-07-09T18:00:00.000Z",
      previousStatus: "connected",
      nextStatus: "refresh_failed",
      data: {
        error: "refresh failed",
      },
    });

    const files = await fs.readdir(directory);
    expect(files).toHaveLength(1);
    const payload = JSON.parse(await fs.readFile(path.join(directory, files[0]!), "utf8")) as Record<string, unknown>;
    expect(payload.event).toBe("connection_refresh_failed");
    expect(JSON.stringify(payload)).not.toContain("access_token");
    expect(JSON.stringify(payload)).not.toContain("refresh_token");
  });
});
