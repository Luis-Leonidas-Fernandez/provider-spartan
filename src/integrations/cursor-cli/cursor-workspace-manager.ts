import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type CursorWorkspaceReservation = {
  mode: "isolated";
  workspacePath: string;
  cleanup(): Promise<void>;
};

export class CursorWorkspaceManager {
  constructor(private readonly prefix = "provider-gateway-cursor-") {}

  async reserveIsolatedWorkspace(): Promise<CursorWorkspaceReservation> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), this.prefix));
    return {
      mode: "isolated",
      workspacePath,
      async cleanup() {
        await fs.rm(workspacePath, { recursive: true, force: true });
      },
    };
  }
}
