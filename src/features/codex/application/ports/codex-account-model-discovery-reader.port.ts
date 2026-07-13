export type CodexAccountModelDiscovery = {
  discoveredAt: string;
  discoverySource: string;
  accountAvailableModels: string[];
  rawModelPermissions: string[];
  codexMiniModels: string[];
  notes?: string | null;
};

export interface CodexAccountModelDiscoveryReaderPort {
  readLatest(): Promise<CodexAccountModelDiscovery | null>;
}
