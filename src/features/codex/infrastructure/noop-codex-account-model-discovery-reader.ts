import type { CodexAccountModelDiscoveryReaderPort } from "../application/ports/codex-account-model-discovery-reader.port.js";

export class NoopCodexAccountModelDiscoveryReader implements CodexAccountModelDiscoveryReaderPort {
  async readLatest() {
    return null;
  }
}
