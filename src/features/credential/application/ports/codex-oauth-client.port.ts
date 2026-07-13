export type CodexOAuthTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresIn: number | null;
};

export type CodexOAuthPkce = {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
};

export interface CodexOAuthClientPort {
  generatePkce(): CodexOAuthPkce;
  buildAuthorizeUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  exchangeCode(input: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<CodexOAuthTokenResponse>;
  refreshToken(input: {
    clientId: string;
    refreshToken: string;
  }): Promise<CodexOAuthTokenResponse>;
}
