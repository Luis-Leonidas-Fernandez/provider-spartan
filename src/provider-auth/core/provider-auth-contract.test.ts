import { describe, expect, it } from "vitest";
import { createProviderGatewayDatabaseContext } from "../../core/database.js";
import { createTestDatabaseUrl } from "../../test/helpers/test-db.js";
import { DrizzleProviderRepository } from "../../features/provider/infrastructure/drizzle-provider.repository.js";
import { CredentialCipherService } from "../../features/credential/infrastructure/credential-cipher.service.js";
import { DrizzleProviderConnectionRepository } from "../infrastructure/drizzle-provider-connection.repository.js";
import { DrizzleOAuthStateRepository } from "../infrastructure/drizzle-oauth-state.repository.js";
import { createProviderAuthModule } from "./provider-auth.module.js";
import { ProviderAuthStrategyRegistry } from "./provider-auth-strategy-registry.js";
import type { ProviderAuthStrategy, ProviderAuthTokenSet, RefreshProviderTokenInput, StartProviderAuthStrategyInput } from "./provider-auth.strategy.js";

class FakeOAuthStrategy implements ProviderAuthStrategy {
  readonly provider = "fake-oauth";

  private exchangeCalls = 0;

  generatePkce() {
    return {
      state: "fake-state-123",
      codeVerifier: "fake-verifier-123",
      codeChallenge: "fake-challenge-123",
    };
  }

  start(input: StartProviderAuthStrategyInput) {
    return {
      redirectUri: `${input.publicBaseUrl ?? "http://localhost:3000"}${input.prefix ?? "/auth"}/fake-oauth/callback`,
      authorizationUrl: `https://fake.example.test/oauth/authorize?state=${input.state}`,
    };
  }

  async exchangeCode(): Promise<ProviderAuthTokenSet> {
    this.exchangeCalls += 1;
    return {
      accessToken: `fake-access-${this.exchangeCalls}`,
      refreshToken: `fake-refresh-${this.exchangeCalls}`,
      idToken: `fake-id-${this.exchangeCalls}`,
      expiresIn: 3600,
      scopes: ["openid", "profile"],
    };
  }

  async refreshToken(input: RefreshProviderTokenInput): Promise<ProviderAuthTokenSet> {
    return {
      accessToken: `${input.refreshToken}-next-access`,
      refreshToken: `${input.refreshToken}-next-refresh`,
      idToken: "fake-id-refreshed",
      expiresIn: 7200,
      scopes: ["openid", "profile", "email"],
    };
  }

  buildConnectionMetadata(input: { tokens: ProviderAuthTokenSet }) {
    return {
      tenant: "fake-tenant",
      accountEmail: "fake@example.com",
      scopes: input.tokens.scopes ?? [],
    };
  }

  getDefaultScopes() {
    return ["openid", "profile"];
  }

  getDefaultConnectionName() {
    return "Fake OAuth Connection";
  }

  getDefaultProviderSeed() {
    return {
      name: "Fake OAuth Provider",
      providerType: "other",
      accessMode: "oauth",
      baseUrl: "https://fake.example.test/api",
      defaultModel: "fake-model-1",
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: false,
      supportsStreaming: false,
      pricingJson: null,
      notes: "Fake provider for provider-auth contract tests.",
    } as const;
  }

  matchesProviderRecord(provider: { providerType: string; accessMode: string }) {
    return provider.providerType === "other" && provider.accessMode === "oauth";
  }
}

describe("provider-auth contract", () => {
  it("works end-to-end with a fake provider strategy", async () => {
    const database = createProviderGatewayDatabaseContext({
      databaseUrl: createTestDatabaseUrl(),
    });
    database.migrate();

    const strategyRegistry = new ProviderAuthStrategyRegistry();
    strategyRegistry.register(new FakeOAuthStrategy());

    const module = createProviderAuthModule({
      strategyRegistry,
      providerRepository: new DrizzleProviderRepository(database.db),
      connectionStore: new DrizzleProviderConnectionRepository(database.db),
      stateStore: new DrizzleOAuthStateRepository(database.db),
      credentialCipher: new CredentialCipherService({
        credentialEncryptionKey: "test-encryption-secret",
        allowInsecureCredentialStorage: false,
      }),
    });

    const started = await module.startProviderAuth({
      provider: "fake-oauth",
      callbackMode: "host",
      publicBaseUrl: "http://localhost:3000",
      prefix: "/provider-gateway/auth",
    });

    expect(started.authorizationUrl).toContain("https://fake.example.test/oauth/authorize");
    expect(started.state).toBe("fake-state-123");

    const completed = await module.completeProviderAuth({
      provider: "fake-oauth",
      state: started.state,
      code: "fake-code-123",
    });

    expect(completed.connection).toMatchObject({
      providerType: "fake-oauth",
      authType: "oauth_token",
      name: "Fake OAuth Connection",
      status: "connected",
    });

    const status = await module.getDefaultProviderAuthStatus({ provider: "fake-oauth" });
    expect(status?.id).toBe(completed.connection.id);

    const valid = await module.getValidProviderCredential(completed.connection.id);
    expect(valid).toMatchObject({
      providerType: "fake-oauth",
      connectionId: completed.connection.id,
      accessToken: "fake-access-1",
      metadata: {
        tenant: "fake-tenant",
        accountEmail: "fake@example.com",
      },
    });

    const refreshed = await module.refreshProviderConnection(completed.connection.id);
    expect(refreshed.metadataJson).toContain("fake-tenant");
    const refreshedValid = await module.getValidProviderCredential(completed.connection.id);
    expect(refreshedValid.accessToken).toBe("fake-refresh-1-next-access");
    expect(refreshedValid.metadata).toMatchObject({
      scopes: ["openid", "profile", "email"],
    });

    const logout = await module.logoutDefaultProvider({ provider: "fake-oauth" });
    expect(logout.loggedOut).toBe(true);

    const disconnected = await module.getDefaultProviderAuthStatus({ provider: "fake-oauth" });
    expect(disconnected).toBeNull();

    database.sqlite.close();
  });
});
