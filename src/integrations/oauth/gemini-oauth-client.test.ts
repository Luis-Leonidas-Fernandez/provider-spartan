import { describe, expect, it, vi } from "vitest";
import { GeminiOAuthClient } from "./gemini-oauth-client.js";

describe("GeminiOAuthClient", () => {
  it("builds authorize url with google scopes and consent params", () => {
    const client = new GeminiOAuthClient();
    const url = new URL(client.buildAuthorizeUrl({
      redirectUri: "http://127.0.0.1:20128/auth/gemini/callback",
      state: "state-123",
    }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/cloud-platform");
  });

  it("exchanges code using form-urlencoded and parses scopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
      scope: "openid profile email",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiOAuthClient();
    const tokens = await client.exchangeCode({
      code: "code-123",
      redirectUri: "http://127.0.0.1/callback",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(tokens).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      idToken: null,
      expiresIn: 3600,
      scopes: ["openid", "profile", "email"],
    });
  });

  it("refreshes token using form-urlencoded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_in: 1800,
      scope: "profile email",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiOAuthClient();
    const tokens = await client.refreshToken({
      refreshToken: "refresh-1",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(tokens.refreshToken).toBe("refresh-2");
    expect(tokens.scopes).toEqual(["profile", "email"]);
  });

  it("probes code assist and extracts project id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      cloudaicompanionProject: { id: "project-123" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiOAuthClient();
    const probe = await client.probeCodeAssist("access-1");

    expect(probe.probeStatus).toBe("succeeded");
    expect(probe.projectId).toBe("project-123");
    expect(probe.eligibility).toBe("eligible");
  });
});
