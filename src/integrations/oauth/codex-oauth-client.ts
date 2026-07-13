import { createHash, randomBytes } from "node:crypto";
import { BadGatewayError, UnauthorizedError } from "../../core/errors.js";

const DEFAULT_CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const DEFAULT_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const DEFAULT_CODEX_SCOPE = "openid profile email offline_access";
const DEFAULT_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEFAULT_CODEX_EXTRA_PARAMS = {
  id_token_add_organizations: "true",
  codex_cli_simplified_flow: "true",
  originator: "codex_cli_rs",
};

export type CodexOAuthAuthorizeInput = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

export type CodexOAuthTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresIn: number | null;
};

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sanitizeTokenResponse(parsed: Record<string, unknown>): CodexOAuthTokenResponse {
  const accessToken = typeof parsed.access_token === "string" ? parsed.access_token : "";
  if (!accessToken) throw new BadGatewayError("OAuth token response did not include access_token", "oauth_token_missing");
  return {
    accessToken,
    refreshToken: typeof parsed.refresh_token === "string" ? parsed.refresh_token : null,
    idToken: typeof parsed.id_token === "string" ? parsed.id_token : null,
    expiresIn: typeof parsed.expires_in === "number" ? parsed.expires_in : null,
  };
}

function resolveClientId(clientId: string | undefined) {
  return clientId?.trim() || DEFAULT_CODEX_CLIENT_ID;
}

export class CodexOAuthClient {
  constructor(
    private readonly options: {
      authorizeUrl?: string;
      tokenUrl?: string;
      scope?: string;
      clientId?: string;
      extraParams?: Record<string, string>;
    } = {},
  ) {}

  generatePkce() {
    const codeVerifier = toBase64Url(randomBytes(32));
    const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
    const state = toBase64Url(randomBytes(24));
    return { codeVerifier, codeChallenge, state };
  }

  buildAuthorizeUrl(input: CodexOAuthAuthorizeInput) {
    const url = new URL(this.options.authorizeUrl ?? DEFAULT_CODEX_AUTHORIZE_URL);
    url.searchParams.set("client_id", resolveClientId(input.clientId || this.options.clientId));
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.options.scope ?? DEFAULT_CODEX_SCOPE);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", input.state);
    for (const [key, value] of Object.entries({ ...DEFAULT_CODEX_EXTRA_PARAMS, ...this.options.extraParams })) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async exchangeCode(input: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) {
    const response = await fetch(this.options.tokenUrl ?? DEFAULT_CODEX_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: resolveClientId(input.clientId || this.options.clientId),
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new BadGatewayError(`OAuth code exchange failed with HTTP ${response.status}`, "oauth_exchange_failed");
    }

    return sanitizeTokenResponse(await response.json() as Record<string, unknown>);
  }

  async refreshToken(input: {
    clientId: string;
    refreshToken: string;
  }) {
    const response = await fetch(this.options.tokenUrl ?? DEFAULT_CODEX_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: resolveClientId(input.clientId || this.options.clientId),
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
      }),
    });

    if (response.status === 400 || response.status === 401) {
      throw new UnauthorizedError("OAuth refresh token is invalid or expired");
    }

    if (!response.ok) {
      throw new BadGatewayError(`OAuth refresh failed with HTTP ${response.status}`, "oauth_refresh_failed");
    }

    return sanitizeTokenResponse(await response.json() as Record<string, unknown>);
  }
}
