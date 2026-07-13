import type { Provider } from "../../../features/provider/domain/provider.types.js";
import { DEFAULT_CODEX_MODEL } from "../../../shared/provider-models/codex-models.js";
import type { ProviderAuthStrategy, ProviderAuthTokenSet, RefreshProviderTokenInput, StartProviderAuthStrategyInput } from "../../core/provider-auth.strategy.js";
import { buildCodexConnectionMetadata } from "./codex-metadata.js";
import type { CodexOAuthClient, CodexOAuthTokenResponse } from "./codex-oauth-client.js";

const CODEX_LOCAL_CALLBACK_URL = "http://localhost:1455/auth/callback";
const CODEX_DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"];

function normalizeTokenResponse(response: CodexOAuthTokenResponse): ProviderAuthTokenSet {
  return {
    accessToken: response.accessToken,
    ...(response.refreshToken !== undefined ? { refreshToken: response.refreshToken } : {}),
    ...(response.idToken !== undefined ? { idToken: response.idToken } : {}),
    expiresIn: response.expiresIn,
    scopes: CODEX_DEFAULT_SCOPES,
  };
}

export class CodexAuthStrategy implements ProviderAuthStrategy {
  readonly provider = "codex";

  constructor(
    private readonly oauthClient: CodexOAuthClient,
    private readonly codexClientId: string,
  ) {}

  buildRedirectUri(input: { callbackMode?: "host" | "local-cli"; publicBaseUrl?: string; prefix?: string }) {
    if (input.callbackMode === "host" && input.publicBaseUrl) {
      const baseUrl = input.publicBaseUrl.replace(/\/$/, "");
      const prefix = (input.prefix ?? "/auth").replace(/\/$/, "");
      return `${baseUrl}${prefix}/codex/callback`;
    }
    return CODEX_LOCAL_CALLBACK_URL;
  }

  generatePkce() {
    return this.oauthClient.generatePkce();
  }

  start(input: StartProviderAuthStrategyInput) {
    const redirectUri = this.buildRedirectUri(input);
    return {
      redirectUri,
      authorizationUrl: this.oauthClient.buildAuthorizeUrl({
        clientId: this.codexClientId,
        redirectUri,
        state: input.state,
        codeChallenge: input.codeChallenge,
      }),
    };
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) {
    return normalizeTokenResponse(await this.oauthClient.exchangeCode({
      clientId: this.codexClientId,
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
    }));
  }

  async refreshToken(input: RefreshProviderTokenInput) {
    return normalizeTokenResponse(await this.oauthClient.refreshToken({
      clientId: this.codexClientId,
      refreshToken: input.refreshToken,
    }));
  }

  buildConnectionMetadata(input: { tokens: ProviderAuthTokenSet }) {
    return buildCodexConnectionMetadata({
      accessToken: input.tokens.accessToken,
      idToken: input.tokens.idToken ?? null,
      ...(input.tokens.scopes ? { scopes: input.tokens.scopes } : {}),
    });
  }

  getDefaultScopes() {
    return [...CODEX_DEFAULT_SCOPES];
  }

  getDefaultConnectionName() {
    return "Codex Connection";
  }

  getDefaultProviderSeed() {
    return {
      name: "Codex Subscription",
      providerType: "codex_subscription",
      accessMode: "oauth",
      baseUrl: null,
      defaultModel: DEFAULT_CODEX_MODEL,
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: true,
      supportsStreaming: false,
      pricingJson: null,
      notes: "Auto-created by the Codex subscription connect flow.",
    } satisfies Omit<Provider, "id" | "createdAt" | "updatedAt">;
  }

  matchesProviderRecord(provider: Provider) {
    return provider.providerType === "codex_subscription" && provider.accessMode === "oauth";
  }
}
