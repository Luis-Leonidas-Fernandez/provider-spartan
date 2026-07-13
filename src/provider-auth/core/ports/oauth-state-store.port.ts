import type { OAuthState } from "../provider-auth.types.js";

export type OAuthStateStorePort = {
  create: (entity: OAuthState) => Promise<void>;
  findByState: (state: string) => Promise<OAuthState | null>;
  deleteByState: (state: string) => Promise<void>;
  deleteExpired: (nowIso: string) => Promise<void>;
  deleteByProviderId: (providerId: string) => Promise<void>;
};

