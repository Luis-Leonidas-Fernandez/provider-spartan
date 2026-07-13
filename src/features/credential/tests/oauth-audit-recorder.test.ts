import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileOAuthAuditRecorder } from "../infrastructure/file-oauth-audit-recorder.js";

describe("FileOAuthAuditRecorder", () => {
  it("writes a sanitized oauth audit event as json", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-oauth-audit-"));
    const recorder = new FileOAuthAuditRecorder(directory);

    await recorder.record({
      providerId: "provider/1",
      providerType: "codex_subscription",
      phase: "exchange_success",
      occurredAt: "2026-07-08T18:00:00.000Z",
      data: {
        tokenResponse: {
          hasAccessToken: true,
          hasRefreshToken: true,
          hasIdToken: true,
          accountEmail: "luis@example.com",
        },
      },
    });

    const files = await fs.readdir(directory);
    expect(files).toHaveLength(1);
    const payload = JSON.parse(await fs.readFile(path.join(directory, files[0]!), "utf8")) as Record<string, unknown>;
    expect(payload.phase).toBe("exchange_success");
    expect(JSON.stringify(payload)).not.toContain("access_token");
    expect(JSON.stringify(payload)).toContain("luis@example.com");
  });
});
