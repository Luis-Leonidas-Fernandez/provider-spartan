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
import type { ProviderConnectionLifecycleAuditEvent, ProviderConnectionLifecycleAuditPort } from "./ports/provider-connection-lifecycle-audit.port.js";
import { ProviderConnectionExpiredError, ProviderConnectionRefreshFailedError, ProviderConnectionRevokedError } from "./provider-auth.errors.js";

class LifecycleOAuthStrategy implements ProviderAuthStrategy {
  readonly provider = "lifecycle-oauth";

  constructor(private readonly mode: "refresh-ok" | "refresh-fails" | "refresh-revoked") {}

  generatePkce() {
    return {
      state: "lifecycle-state",
      codeVerifier: "lifecycle-verifier",
      codeChallenge: "lifecycle-challenge",
    };
  }

  start(input: StartProviderAuthStrategyInput) {
    return {
      redirectUri: `${input.publicBaseUrl ?? "http://localhost:3000"}${input.prefix ?? "/auth"}/lifecycle-oauth/callback`,
      authorizationUrl: "https://lifecycle.example.test/oauth/authorize?state=lifecycle-state",
    };
  }

  async exchangeCode(): Promise<ProviderAuthTokenSet> {
    return {
      accessToken: "lifecycle-access",
      refreshToken: "lifecycle-refresh",
      expiresIn: 3600,
      scopes: ["openid"],
    };
  }

  async refreshToken(input: RefreshProviderTokenInput): Promise<ProviderAuthTokenSet> {
    if (this.mode === "refresh-fails") {
      throw new Error("provider rejected refresh");
    }
    if (this.mode === "refresh-revoked") {
      throw new ProviderConnectionRevokedError(input.connection.id, new Error("provider revoked access"));
    }
    return {
      accessToken: `${input.refreshToken}-new-access`,
      refreshToken: `${input.refreshToken}-new-refresh`,
      expiresIn: 3600,
      scopes: ["openid", "profile"],
    };
  }

  getDefaultProviderSeed() {
    return {
      name: "Lifecycle OAuth Provider",
      providerType: "other",
      accessMode: "oauth",
      baseUrl: "https://lifecycle.example.test/api",
      defaultModel: "lifecycle-model",
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: false,
      supportsStreaming: false,
      pricingJson: null,
      notes: "Lifecycle test provider.",
    } as const;
  }

  matchesProviderRecord(provider: { providerType: string; accessMode: string }) {
    return provider.providerType === "other" && provider.accessMode === "oauth";
  }
}

class MemoryLifecycleAuditRecorder implements ProviderConnectionLifecycleAuditPort {
  readonly events: ProviderConnectionLifecycleAuditEvent[] = [];

  async record(event: ProviderConnectionLifecycleAuditEvent) {
    this.events.push(event);
  }
}

async function createModule(
  mode: "refresh-ok" | "refresh-fails" | "refresh-revoked",
  options?: { refreshBeforeExpiresMs?: number },
) {
  const database = createProviderGatewayDatabaseContext({
    databaseUrl: createTestDatabaseUrl(),
  });
  database.migrate();

  const strategyRegistry = new ProviderAuthStrategyRegistry();
  strategyRegistry.register(new LifecycleOAuthStrategy(mode));
  const lifecycleAuditRecorder = new MemoryLifecycleAuditRecorder();

  const module = createProviderAuthModule({
    strategyRegistry,
    providerRepository: new DrizzleProviderRepository(database.db),
    connectionStore: new DrizzleProviderConnectionRepository(database.db),
    stateStore: new DrizzleOAuthStateRepository(database.db),
    credentialCipher: new CredentialCipherService({
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
    }),
    ...(options?.refreshBeforeExpiresMs !== undefined ? { refreshBeforeExpiresMs: options.refreshBeforeExpiresMs } : {}),
    lifecycleAuditRecorder,
  });

  return { database, module, connectionStore: new DrizzleProviderConnectionRepository(database.db), lifecycleAuditRecorder };
}

describe("provider-auth lifecycle", () => {
  it("marks connection as expired when token is expired and no refresh token exists", async () => {
    const { database, module, connectionStore, lifecycleAuditRecorder } = await createModule("refresh-ok");

    const started = await module.startProviderAuth({
      provider: "lifecycle-oauth",
      callbackMode: "host",
      publicBaseUrl: "http://localhost:3000",
      prefix: "/auth",
    });
    const completed = await module.completeProviderAuth({
      provider: "lifecycle-oauth",
      state: started.state,
      code: "test-code",
    });

    await connectionStore.update({
      ...completed.connection,
      encryptedRefreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      status: "connected",
    });

    await expect(module.getValidProviderCredential(completed.connection.id)).rejects.toBeInstanceOf(ProviderConnectionExpiredError);
    const status = await module.getProviderAuthStatus(completed.connection.id);
    expect(status.status).toBe("expired");
    expect(lifecycleAuditRecorder.events.some((event) => event.event === "connection_expired")).toBe(true);

    database.sqlite.close();
  });

  it("marks connection as refresh_failed when refresh throws", async () => {
    const { database, module, connectionStore, lifecycleAuditRecorder } = await createModule("refresh-fails");

    const started = await module.startProviderAuth({
      provider: "lifecycle-oauth",
      callbackMode: "host",
      publicBaseUrl: "http://localhost:3000",
      prefix: "/auth",
    });
    const completed = await module.completeProviderAuth({
      provider: "lifecycle-oauth",
      state: started.state,
      code: "test-code",
    });

    await connectionStore.update({
      ...completed.connection,
      tokenExpiresAt: new Date(Date.now() + 5_000).toISOString(),
      status: "connected",
    });

    await expect(module.getValidProviderCredential(completed.connection.id)).rejects.toBeInstanceOf(ProviderConnectionRefreshFailedError);
    const status = await module.getProviderAuthStatus(completed.connection.id);
    expect(status.status).toBe("refresh_failed");
    expect(lifecycleAuditRecorder.events.some((event) => event.event === "connection_refresh_failed")).toBe(true);

    database.sqlite.close();
  });

  it("respects custom refresh skew before forcing refresh", async () => {
    const { database, module, connectionStore } = await createModule("refresh-ok", {
      refreshBeforeExpiresMs: 60_000,
    });

    const started = await module.startProviderAuth({
      provider: "lifecycle-oauth",
      callbackMode: "host",
      publicBaseUrl: "http://localhost:3000",
      prefix: "/auth",
    });
    const completed = await module.completeProviderAuth({
      provider: "lifecycle-oauth",
      state: started.state,
      code: "test-code",
    });

    await connectionStore.update({
      ...completed.connection,
      tokenExpiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      status: "connected",
    });

    const valid = await module.getValidProviderCredential(completed.connection.id);
    expect(valid.accessToken).toBe("lifecycle-access");

    database.sqlite.close();
  });

  it("records revoked separately from logout", async () => {
    const { database, module, connectionStore, lifecycleAuditRecorder } = await createModule("refresh-revoked");

    const started = await module.startProviderAuth({
      provider: "lifecycle-oauth",
      callbackMode: "host",
      publicBaseUrl: "http://localhost:3000",
      prefix: "/auth",
    });
    const completed = await module.completeProviderAuth({
      provider: "lifecycle-oauth",
      state: started.state,
      code: "test-code",
    });

    await connectionStore.update({
      ...completed.connection,
      tokenExpiresAt: new Date(Date.now() + 5_000).toISOString(),
      status: "connected",
    });

    await expect(module.getValidProviderCredential(completed.connection.id)).rejects.toBeInstanceOf(ProviderConnectionRevokedError);
    await module.logoutDefaultProvider({ provider: "lifecycle-oauth" });

    expect(lifecycleAuditRecorder.events.some((event) => event.event === "connection_revoked")).toBe(true);
    expect(lifecycleAuditRecorder.events.some((event) => event.event === "connection_logged_out")).toBe(true);

    database.sqlite.close();
  });
});
