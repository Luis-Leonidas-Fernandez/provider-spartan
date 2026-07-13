export type CredentialType = "api_key" | "bearer_token" | "oauth_token" | "local_no_auth" | "manual_no_auth" | "other";
export type LoginStatus = "unknown" | "authenticated" | "expired" | "failed" | "not_required";

export type ProviderCredential = {
  id: string;
  providerId: string;
  credentialType: CredentialType;
  encryptedValue: string;
  encryptedRefreshToken: string | null;
  encryptedIdToken: string | null;
  maskedValue: string;
  metadataJson: string | null;
  tokenExpiresAt: string | null;
  lastRefreshAt: string | null;
  refreshTokenExists: boolean;
  loginStatus: LoginStatus;
  lastAuthCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderOAuthSession = {
  id: string;
  providerId: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: string;
  createdAt: string;
};
