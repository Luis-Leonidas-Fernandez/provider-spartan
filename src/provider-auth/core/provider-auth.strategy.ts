import type { Provider } from "../../features/provider/domain/provider.types.js";
import type { ProviderConnection, ProviderCredentialMetadata, StartProviderAuthInput } from "./provider-auth.types.js";

export type ProviderAuthPkce = {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
};

export type ProviderAuthTokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  expiresIn: number | null;
  scopes?: string[] | null;
};

export type StartProviderAuthStrategyInput = StartProviderAuthInput & {
  providerId: string;
  codeChallenge: string;
  state: string;
};

export type StartProviderAuthStrategyResult = {
  redirectUri: string;
  authorizationUrl: string;
};

export type ExchangeCodeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export type RefreshProviderTokenInput = {
  refreshToken: string;
  connection: ProviderConnection;
};

export type BuildConnectionMetadataInput = {
  tokens: ProviderAuthTokenSet;
  previousMetadata?: ProviderCredentialMetadata;
  previousConnection?: ProviderConnection | null;
};

export type DefaultProviderSeed = Omit<Provider, "id" | "createdAt" | "updatedAt">;

export interface ProviderAuthStrategy {
  provider: string;
  generatePkce: () => ProviderAuthPkce;
  start: (input: StartProviderAuthStrategyInput) => StartProviderAuthStrategyResult;
  exchangeCode: (input: ExchangeCodeInput) => Promise<ProviderAuthTokenSet>;
  refreshToken?: (input: RefreshProviderTokenInput) => Promise<ProviderAuthTokenSet>;
  buildConnectionMetadata?: (input: BuildConnectionMetadataInput) => Promise<ProviderCredentialMetadata> | ProviderCredentialMetadata;
  getDefaultScopes?: () => string[];
  getDefaultConnectionName?: (input: { provider: Provider; previousConnection?: ProviderConnection | null }) => string;
  getDefaultProviderSeed?: () => DefaultProviderSeed;
  matchesProviderRecord?: (provider: Provider) => boolean;
}
