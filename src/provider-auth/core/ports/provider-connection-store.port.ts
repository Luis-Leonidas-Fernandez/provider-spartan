import type { ProviderConnection } from "../provider-auth.types.js";

export type ProviderConnectionStorePort = {
  create: (entity: ProviderConnection) => Promise<void>;
  update: (entity: ProviderConnection) => Promise<void>;
  findById: (id: string) => Promise<ProviderConnection | null>;
  findDefaultByProviderId: (providerId: string) => Promise<ProviderConnection | null>;
  clearDefaultsForProviderId: (providerId: string) => Promise<void>;
  deleteById: (id: string) => Promise<void>;
};

