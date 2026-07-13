export type ProviderConnectionStatus =
  | "pending"
  | "connected"
  | "expired"
  | "refresh_failed"
  | "revoked"
  | "disabled"
  | "error";

export type ProviderConnectionStatusReason =
  | "not_connected"
  | "expired"
  | "refresh_failed"
  | "revoked"
  | "disabled"
  | "error"
  | "missing_required_scope"
  | "runtime_unavailable"
  | null;

export type ProviderAuthType = "oauth_token" | "access_token" | "api_key" | "bearer_token" | "custom";

export type ProviderConnection = {
  id: string;
  providerId: string;
  providerType: string;
  authType: ProviderAuthType;
  name: string;
  status: ProviderConnectionStatus;
  isDefault: boolean;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  encryptedIdToken: string | null;
  scopesJson: string | null;
  metadataJson: string | null;
  tokenExpiresAt: string | null;
  lastRefreshAt: string | null;
  lastAuthCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OAuthState = {
  id: string;
  providerId: string;
  providerType: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: string;
  createdAt: string;
};

export type ProviderCredentialMetadata = Record<string, unknown>;

export type ValidProviderCredential = {
  providerType: string;
  connectionId: string;
  accessToken?: string;
  apiKey?: string;
  bearerToken?: string;
  expiresAt?: string;
  metadata?: ProviderCredentialMetadata;
};

export type StartProviderAuthInput = {
  provider: string;
  providerId?: string;
  connectionName?: string;
  publicBaseUrl?: string;
  callbackMode?: "host" | "local-cli";
  prefix?: string;
};

export type CompleteProviderAuthInput = {
  provider: string;
  state: string;
  code: string;
};
