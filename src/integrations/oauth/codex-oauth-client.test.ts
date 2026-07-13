import { describe, expect, it, vi } from "vitest";
import { CodexOAuthClient } from "./codex-oauth-client.js";

describe("CodexOAuthClient", () => {
  it("builds authorize url with pkce, state, and extra params", () => {
    const client = new CodexOAuthClient({ extraParams: { prompt: "login" } });
    const url = new URL(client.buildAuthorizeUrl({
      clientId: "client-123",
      redirectUri: "http://127.0.0.1:20128/providers/p/oauth/callback",
      state: "state-123",
      codeChallenge: "challenge-123",
    }));

    expect(url.origin + url.pathname).toBe("https://auth.openai.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("originator")).toBe("codex_cli_rs");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
  });

  it("uses the built-in Codex public client id when none is configured", () => {
    const client = new CodexOAuthClient();
    const url = new URL(client.buildAuthorizeUrl({
      clientId: "",
      redirectUri: "http://127.0.0.1:20128/providers/p/oauth/callback",
      state: "state-123",
      codeChallenge: "challenge-123",
    }));

    expect(url.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
  });

  it("exchanges code using form-urlencoded and parses tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-1",
      refresh_token: "refresh-1",
      id_token: "id-1",
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new CodexOAuthClient();
    const tokens = await client.exchangeCode({
      clientId: "client-123",
      code: "code-123",
      codeVerifier: "verifier-123",
      redirectUri: "http://127.0.0.1/callback",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(tokens).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      idToken: "id-1",
      expiresIn: 3600,
    });
  });

  it("refreshes token using form-urlencoded and parses tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-2",
      refresh_token: "refresh-2",
      id_token: "id-2",
      expires_in: 1800,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new CodexOAuthClient();
    const tokens = await client.refreshToken({
      clientId: "client-123",
      refreshToken: "refresh-1",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(tokens).toEqual({
      accessToken: "access-2",
      refreshToken: "refresh-2",
      idToken: "id-2",
      expiresIn: 1800,
    });
  });
});
