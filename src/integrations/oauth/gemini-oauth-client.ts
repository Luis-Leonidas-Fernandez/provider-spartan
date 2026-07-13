import { arch, platform } from "node:os";
import { randomBytes } from "node:crypto";
import { BadGatewayError, UnauthorizedError } from "../../core/errors.js";
import { DEFAULT_GEMINI_OAUTH_SCOPES } from "./gemini-oauth-scopes.js";

const DEFAULT_GEMINI_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_GEMINI_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_GEMINI_USER_INFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo";
const DEFAULT_GEMINI_LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const DEFAULT_GEMINI_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const DEFAULT_GEMINI_CLIENT_SECRET = "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";

export type GeminiOAuthAuthorizeInput = {
  clientId?: string;
  redirectUri: string;
  state: string;
};

export type GeminiOAuthTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresIn: number | null;
  scopes: string[];
};

export type GeminiUserInfo = {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  id?: string;
};

export type GeminiCodeAssistProbeResult = {
  probeStatus: "succeeded" | "failed";
  eligibility: "eligible" | "requires_project" | "unknown";
  projectId: string | null;
  checkedAt: string;
  error?: string;
};

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function resolveClientId(clientId: string | undefined) {
  return clientId?.trim() || DEFAULT_GEMINI_CLIENT_ID;
}

function resolveClientSecret(clientSecret: string | undefined) {
  return clientSecret?.trim() || DEFAULT_GEMINI_CLIENT_SECRET;
}

function parseScopes(raw: unknown) {
  if (typeof raw !== "string") return [...DEFAULT_GEMINI_OAUTH_SCOPES];
  return raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function sanitizeTokenResponse(parsed: Record<string, unknown>): GeminiOAuthTokenResponse {
  const accessToken = typeof parsed.access_token === "string" ? parsed.access_token : "";
  if (!accessToken) throw new BadGatewayError("OAuth token response did not include access_token", "oauth_token_missing");
  return {
    accessToken,
    refreshToken: typeof parsed.refresh_token === "string" ? parsed.refresh_token : null,
    idToken: typeof parsed.id_token === "string" ? parsed.id_token : null,
    expiresIn: typeof parsed.expires_in === "number" ? parsed.expires_in : null,
    scopes: parseScopes(parsed.scope),
  };
}

function getOAuthPlatformEnum() {
  const os = platform();
  const architecture = arch();
  if (os === "darwin") return architecture === "arm64" ? 2 : 1;
  if (os === "linux") return architecture === "arm64" ? 4 : 3;
  if (os === "win32") return 5;
  return 0;
}

export function getGeminiOAuthClientMetadata() {
  return {
    ideType: 9,
    platform: getOAuthPlatformEnum(),
    pluginType: 2,
  };
}

function extractProjectId(payload: Record<string, unknown>) {
  const raw = payload.cloudaicompanionProject;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string" && raw.id.trim()) {
    return raw.id.trim();
  }
  return null;
}

export class GeminiOAuthClient {
  constructor(
    private readonly options: {
      authorizeUrl?: string;
      tokenUrl?: string;
      userInfoUrl?: string;
      loadCodeAssistUrl?: string;
      clientId?: string;
      clientSecret?: string;
      scopes?: string[];
    } = {},
  ) {}

  generateState() {
    return toBase64Url(randomBytes(24));
  }

  buildAuthorizeUrl(input: GeminiOAuthAuthorizeInput) {
    const url = new URL(this.options.authorizeUrl ?? DEFAULT_GEMINI_AUTHORIZE_URL);
    url.searchParams.set("client_id", resolveClientId(input.clientId || this.options.clientId));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", (this.options.scopes ?? DEFAULT_GEMINI_OAUTH_SCOPES).join(" "));
    url.searchParams.set("state", input.state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }

  async exchangeCode(input: {
    clientId?: string;
    clientSecret?: string;
    code: string;
    redirectUri: string;
  }) {
    const response = await fetch(this.options.tokenUrl ?? DEFAULT_GEMINI_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: resolveClientId(input.clientId || this.options.clientId),
        client_secret: resolveClientSecret(input.clientSecret || this.options.clientSecret),
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new BadGatewayError(`OAuth code exchange failed with HTTP ${response.status}`, "oauth_exchange_failed");
    }

    return sanitizeTokenResponse(await response.json() as Record<string, unknown>);
  }

  async refreshToken(input: {
    clientId?: string;
    clientSecret?: string;
    refreshToken: string;
  }) {
    const response = await fetch(this.options.tokenUrl ?? DEFAULT_GEMINI_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: resolveClientId(input.clientId || this.options.clientId),
        client_secret: resolveClientSecret(input.clientSecret || this.options.clientSecret),
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

  async getUserInfo(accessToken: string) {
    const response = await fetch(`${this.options.userInfoUrl ?? DEFAULT_GEMINI_USER_INFO_URL}?alt=json`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new BadGatewayError(`Gemini user info failed with HTTP ${response.status}`, "gemini_userinfo_failed");
    }

    return await response.json() as GeminiUserInfo;
  }

  async probeCodeAssist(accessToken: string): Promise<GeminiCodeAssistProbeResult> {
    const checkedAt = new Date().toISOString();
    try {
      const metadata = getGeminiOAuthClientMetadata();
      const response = await fetch(this.options.loadCodeAssistUrl ?? DEFAULT_GEMINI_LOAD_CODE_ASSIST_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "google-api-nodejs-client/9.15.1",
          "x-goog-api-client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
          "client-metadata": JSON.stringify(metadata),
        },
        body: JSON.stringify({
          metadata,
          mode: 1,
        }),
      });

      if (!response.ok) {
        return {
          probeStatus: "failed",
          eligibility: "unknown",
          projectId: null,
          checkedAt,
          error: `HTTP ${response.status}`,
        };
      }

      const payload = await response.json() as Record<string, unknown>;
      const projectId = extractProjectId(payload);
      return {
        probeStatus: "succeeded",
        eligibility: projectId ? "eligible" : "requires_project",
        projectId,
        checkedAt,
      };
    } catch (error) {
      return {
        probeStatus: "failed",
        eligibility: "unknown",
        projectId: null,
        checkedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
