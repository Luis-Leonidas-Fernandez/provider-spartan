import type { Provider } from "../../../features/provider/domain/provider.types.js";
import type {
  ProviderAuthStrategy,
  ProviderAuthTokenSet,
  RefreshProviderTokenInput,
  StartProviderAuthStrategyInput,
} from "../../core/provider-auth.strategy.js";
import { buildGeminiConnectionMetadata } from "./gemini-metadata.js";
import { GeminiOAuthClient, type GeminiOAuthTokenResponse } from "./gemini-oauth-client.js";
import { DEFAULT_GEMINI_OAUTH_SCOPES } from "../../../integrations/oauth/gemini-oauth-scopes.js";

const GEMINI_DEFAULT_MODEL = "gemini-2.5-pro";

function normalizeTokenResponse(response: GeminiOAuthTokenResponse): ProviderAuthTokenSet {
  return {
    accessToken: response.accessToken,
    ...(response.refreshToken !== undefined ? { refreshToken: response.refreshToken } : {}),
    ...(response.idToken !== undefined ? { idToken: response.idToken } : {}),
    expiresIn: response.expiresIn,
    scopes: response.scopes,
  };
}

export class GeminiAuthStrategy implements ProviderAuthStrategy {
  readonly provider = "gemini";

  constructor(private readonly oauthClient: GeminiOAuthClient) {}

  private buildRedirectUri(input: { publicBaseUrl?: string; prefix?: string }) {
    const baseUrl = input.publicBaseUrl?.replace(/\/$/, "");
    const prefix = (input.prefix ?? "/auth").replace(/\/$/, "");
    if (!baseUrl) {
      throw new Error("Gemini auth requires publicBaseUrl");
    }
    return `${baseUrl}${prefix}/gemini/callback`;
  }

  generatePkce() {
    const state = this.oauthClient.generateState();
    return {
      state,
      codeVerifier: state,
      codeChallenge: state,
    };
  }

  start(input: StartProviderAuthStrategyInput) {
    const redirectUri = this.buildRedirectUri(input);
    return {
      redirectUri,
      authorizationUrl: this.oauthClient.buildAuthorizeUrl({
        redirectUri,
        state: input.state,
      }),
    };
  }

  async exchangeCode(input: { code: string; redirectUri: string }) {
    return normalizeTokenResponse(await this.oauthClient.exchangeCode({
      code: input.code,
      redirectUri: input.redirectUri,
    }));
  }

  async refreshToken(input: RefreshProviderTokenInput) {
    return normalizeTokenResponse(await this.oauthClient.refreshToken({
      refreshToken: input.refreshToken,
    }));
  }

  async buildConnectionMetadata(input: { tokens: ProviderAuthTokenSet; previousMetadata?: Record<string, unknown> }) {
    const [userInfoResult, codeAssistResult] = await Promise.allSettled([
      this.oauthClient.getUserInfo(input.tokens.accessToken),
      this.oauthClient.probeCodeAssist(input.tokens.accessToken),
    ]);

    return buildGeminiConnectionMetadata({
      userInfo: userInfoResult.status === "fulfilled" ? userInfoResult.value : null,
      scopes: input.tokens.scopes ?? [...DEFAULT_GEMINI_OAUTH_SCOPES],
      codeAssist: codeAssistResult.status === "fulfilled" ? codeAssistResult.value : null,
      ...(input.previousMetadata ? { previousMetadata: input.previousMetadata } : {}),
    });
  }

  getDefaultScopes() {
    return [...DEFAULT_GEMINI_OAUTH_SCOPES];
  }

  getDefaultConnectionName() {
    return "Gemini Connection";
  }

  getDefaultProviderSeed() {
    return {
      name: "Gemini CLI Auth",
      providerType: "gemini",
      accessMode: "oauth",
      baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
      defaultModel: GEMINI_DEFAULT_MODEL,
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: false,
      supportsStreaming: false,
      pricingJson: null,
      notes: "Auto-created by the Gemini local auth flow inspired by 9router gemini-cli.",
    } satisfies Omit<Provider, "id" | "createdAt" | "updatedAt">;
  }

  matchesProviderRecord(provider: Provider) {
    return provider.providerType === "gemini" && provider.accessMode === "oauth";
  }
}
