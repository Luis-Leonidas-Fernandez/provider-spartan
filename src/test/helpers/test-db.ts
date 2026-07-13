import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createTestDatabaseUrl() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-gateway-"));
  return `file:${path.join(dir, "test.db")}`;
}
