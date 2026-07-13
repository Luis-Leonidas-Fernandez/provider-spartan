import { createHash } from "node:crypto";
import { AppError, NotFoundError, UnauthorizedError } from "../../../../core/errors.js";
import type { Logger } from "../../../../core/logger.js";
import { nowIso } from "../../../../shared/date/date.js";
import { createProviderCredential, createProviderOAuthSession } from "../../domain/credential.entity.js";
import type { CredentialRepositoryPort } from "../ports/credential-repository.port.js";
import type { ProviderOAuthSessionRepositoryPort } from "../ports/provider-oauth-session-repository.port.js";
import type { CredentialCipherPort } from "../ports/credential-cipher.port.js";
import type { OAuthAuditRecorderPort } from "../ports/oauth-audit-recorder.port.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { Provider } from "../../../provider/domain/provider.types.js";
import { createProvider, createProviderHealth } from "../../../provider/domain/provider.entity.js";
import type { ProviderCredential } from "../../domain/credential.types.js";
import { extractCodexAccountInfo } from "../../../../shared/oauth/codex-account-info.js";
import { DEFAULT_CODEX_MODEL } from "../../../../shared/provider-models/codex-models.js";
import { isCredentialExpired, shouldRefreshCredential } from "../services/credential-refresh-policy.js";
import { TokenRefreshDeduper } from "../services/token-refresh-deduper.js";
import type { CodexOAuthClientPort, CodexOAuthTokenResponse } from "../ports/codex-oauth-client.port.js";

function ensureCodexOAuthProvider(provider: Provider | null) {
  if (!provider) throw new NotFoundError("Provider not found");
  if (provider.providerType !== "codex_subscription" || provider.accessMode !== "oauth") {
    throw new AppError("Provider does not support Codex OAuth", 400, "provider_oauth_not_supported");
  }
  return provider;
}


const CODEX_LOCAL_CALLBACK_URL = "http://localhost:1455/auth/callback";

async function getOrCreateDefaultCodexOAuthProvider(repository: ProviderRepositoryPort) {
  const providers = await repository.findAll();
  const existing = providers.find((provider) =>
    provider.providerType === "codex_subscription"
    && provider.accessMode === "oauth"
    && provider.isEnabled
  );
  if (existing) return existing;

  const entity = createProvider({
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
  });

  await repository.create(entity);
  await repository.upsertHealth(createProviderHealth(entity.id));
  return entity;
}

function computeExpiresAt(expiresIn: number | null) {
  if (!expiresIn || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function parseJsonRecord(value: string | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function mergeLegacyCodexMetadata(existingMetadataJson: string | null | undefined, tokenResponse: CodexOAuthTokenResponse, fallbackToken?: string | null) {
  const existing = parseJsonRecord(existingMetadataJson);
  const extracted = extractCodexAccountInfo(tokenResponse.idToken ?? fallbackToken);
  return JSON.stringify({
    ...existing,
    ...(extracted.accountEmail ? { accountEmail: extracted.accountEmail } : {}),
    ...(extracted.chatgptAccountId ? { chatgptAccountId: extracted.chatgptAccountId } : {}),
    ...(extracted.chatgptPlanType ? { chatgptPlanType: extracted.chatgptPlanType } : {}),
    ...(typeof extracted.jwtExp === "number" ? { jwtExp: extracted.jwtExp } : {}),
  });
}

async function recordAuditSafely(
  auditRecorder: OAuthAuditRecorderPort,
  event: Parameters<OAuthAuditRecorderPort["record"]>[0],
) {
  try {
    await auditRecorder.record(event);
  } catch {
    // Audit files are diagnostic only; failing to write one must not break auth.
  }
}

function summarizeSecret(value: string | null) {
  if (!value) return { present: false };
  return {
    present: true,
    length: value.length,
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

function summarizeTokenResponse(tokens: CodexOAuthTokenResponse, fallbackToken?: string | null) {
  const inspectedToken = tokens.idToken ?? fallbackToken ?? tokens.accessToken;
  const extracted = extractCodexAccountInfo(inspectedToken);
  return {
    receivedFields: {
      accessToken: Boolean(tokens.accessToken),
      refreshToken: Boolean(tokens.refreshToken),
      idToken: Boolean(tokens.idToken),
      expiresIn: tokens.expiresIn !== null,
    },
    tokenDiagnostics: {
      accessToken: summarizeSecret(tokens.accessToken),
      refreshToken: summarizeSecret(tokens.refreshToken),
      idToken: summarizeSecret(tokens.idToken),
    },
    expiresIn: tokens.expiresIn,
    expiresAt: computeExpiresAt(tokens.expiresIn),
    account: extracted,
  };
}

type UpsertOauthCredentialInput = {
  providerId: string;
  existing: ProviderCredential | null;
  tokens: CodexOAuthTokenResponse;
  cipher: CredentialCipherPort;
  metadataJson?: string | null;
};

export async function upsertOauthCredential(input: UpsertOauthCredentialInput, repository: CredentialRepositoryPort) {
  const access = input.cipher.encrypt(input.tokens.accessToken);
  const previousRefreshToken = input.existing?.encryptedRefreshToken ? input.cipher.decrypt(input.existing.encryptedRefreshToken) : null;
  const effectiveRefreshToken = input.tokens.refreshToken ?? previousRefreshToken;
  const refresh = effectiveRefreshToken ? input.cipher.encrypt(effectiveRefreshToken) : null;
  const previousIdToken = input.existing?.encryptedIdToken ? input.cipher.decrypt(input.existing.encryptedIdToken) : null;
  const effectiveIdToken = input.tokens.idToken ?? previousIdToken;
  const idToken = effectiveIdToken ? input.cipher.encrypt(effectiveIdToken) : null;
  const entity = createProviderCredential({
    providerId: input.providerId,
    credentialType: "oauth_token",
    encryptedValue: access.encryptedValue,
    encryptedRefreshToken: refresh?.encryptedValue ?? null,
    encryptedIdToken: idToken?.encryptedValue ?? null,
    maskedValue: access.maskedValue,
    metadataJson: input.metadataJson ?? null,
    tokenExpiresAt: computeExpiresAt(input.tokens.expiresIn) ?? input.existing?.tokenExpiresAt ?? null,
    lastRefreshAt: nowIso(),
    refreshTokenExists: Boolean(effectiveRefreshToken),
    loginStatus: "authenticated",
    lastAuthCheckAt: nowIso(),
  });

  await repository.upsert(input.existing
    ? { ...input.existing, ...entity, id: input.existing.id, createdAt: input.existing.createdAt, updatedAt: nowIso() }
    : entity);

  return repository.findByProviderId(input.providerId);
}

export class StartCodexOAuthUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly oauthSessionRepository: ProviderOAuthSessionRepositoryPort,
    private readonly oauthClient: CodexOAuthClientPort,
    private readonly codexClientId: string,
    private readonly auditRecorder: OAuthAuditRecorderPort,
  ) {}

  async execute(providerId: string) {
    const provider = ensureCodexOAuthProvider(await this.providerRepository.findById(providerId));

    await this.oauthSessionRepository.deleteExpired(nowIso());
    await this.oauthSessionRepository.deleteByProviderId(provider.id);
    const pkce = this.oauthClient.generatePkce();
    const redirectUri = CODEX_LOCAL_CALLBACK_URL;
    const session = createProviderOAuthSession({
      providerId: provider.id,
      state: pkce.state,
      codeVerifier: pkce.codeVerifier,
      redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    await this.oauthSessionRepository.create(session);

    await recordAuditSafely(this.auditRecorder, {
      providerId: provider.id,
      providerType: "codex_subscription",
      phase: "start",
      occurredAt: nowIso(),
      data: {
        redirectUri,
        expiresAt: session.expiresAt,
        state: session.state,
        authorizeHost: new URL(this.oauthClient.buildAuthorizeUrl({
          clientId: this.codexClientId,
          redirectUri,
          state: pkce.state,
          codeChallenge: pkce.codeChallenge,
        })).host,
      },
    });

    return {
      providerId: provider.id,
      authorizationUrl: this.oauthClient.buildAuthorizeUrl({
        clientId: this.codexClientId,
        redirectUri,
        state: pkce.state,
        codeChallenge: pkce.codeChallenge,
      }),
      expiresAt: session.expiresAt,
      state: session.state,
    };
  }
}


export class StartDefaultCodexOAuthUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly startCodexOAuth: StartCodexOAuthUseCase,
  ) {}

  async execute() {
    const provider = await getOrCreateDefaultCodexOAuthProvider(this.providerRepository);
    return this.startCodexOAuth.execute(provider.id);
  }
}

export class DisconnectDefaultCodexOAuthUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly credentialRepository: CredentialRepositoryPort,
    private readonly oauthSessionRepository: ProviderOAuthSessionRepositoryPort,
  ) {}

  async execute() {
    const provider = await getOrCreateDefaultCodexOAuthProvider(this.providerRepository);
    await this.oauthSessionRepository.deleteByProviderId(provider.id);
    await this.credentialRepository.deleteByProviderId(provider.id);
    return {
      disconnected: true,
      providerId: provider.id,
    };
  }
}

export class CompleteCodexOAuthUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly oauthSessionRepository: ProviderOAuthSessionRepositoryPort,
    private readonly credentialRepository: CredentialRepositoryPort,
    private readonly cipher: CredentialCipherPort,
    private readonly oauthClient: CodexOAuthClientPort,
    private readonly codexClientId: string,
    private readonly auditRecorder: OAuthAuditRecorderPort,
  ) {}

  async execute(input: { providerId: string; state: string; code: string }) {
    ensureCodexOAuthProvider(await this.providerRepository.findById(input.providerId));

    const session = await this.oauthSessionRepository.findByState(input.state);
    if (!session || session.providerId !== input.providerId) throw new UnauthorizedError("Invalid OAuth state");
    if (Date.parse(session.expiresAt) < Date.now()) {
      await this.oauthSessionRepository.deleteByState(input.state);
      throw new UnauthorizedError("OAuth session expired");
    }

    let tokens: CodexOAuthTokenResponse;
    try {
      tokens = await this.oauthClient.exchangeCode({
        clientId: this.codexClientId,
        code: input.code,
        codeVerifier: session.codeVerifier,
        redirectUri: session.redirectUri,
      });
      await recordAuditSafely(this.auditRecorder, {
        providerId: input.providerId,
        providerType: "codex_subscription",
        phase: "exchange_success",
        occurredAt: nowIso(),
        data: {
          redirectUri: session.redirectUri,
          tokenResponse: summarizeTokenResponse(tokens),
        },
      });
    } catch (error) {
      await recordAuditSafely(this.auditRecorder, {
        providerId: input.providerId,
        providerType: "codex_subscription",
        phase: "exchange_failed",
        occurredAt: nowIso(),
        data: {
          redirectUri: session.redirectUri,
          error: error instanceof Error ? error.message : "OAuth exchange failed",
        },
      });
      throw error;
    }

    const existing = await this.credentialRepository.findByProviderId(input.providerId);
    const credential = await upsertOauthCredential({
      providerId: input.providerId,
      existing,
      tokens,
      cipher: this.cipher,
      metadataJson: mergeLegacyCodexMetadata(existing?.metadataJson, tokens, tokens.accessToken),
    }, this.credentialRepository);

    await this.oauthSessionRepository.deleteByState(input.state);
    return credential;
  }
}


export class CompleteCodexOAuthByStateUseCase {
  constructor(
    private readonly oauthSessionRepository: ProviderOAuthSessionRepositoryPort,
    private readonly completeCodexOAuth: CompleteCodexOAuthUseCase,
  ) {}

  async execute(input: { state: string; code: string }) {
    const session = await this.oauthSessionRepository.findByState(input.state);
    if (!session) throw new UnauthorizedError("Invalid OAuth state");
    return this.completeCodexOAuth.execute({
      providerId: session.providerId,
      state: input.state,
      code: input.code,
    });
  }
}

export class RefreshCodexOAuthCredentialUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly credentialRepository: CredentialRepositoryPort,
    private readonly cipher: CredentialCipherPort,
    private readonly oauthClient: CodexOAuthClientPort,
    private readonly codexClientId: string,
    private readonly deduper: TokenRefreshDeduper,
    private readonly logger: Logger,
    private readonly auditRecorder: OAuthAuditRecorderPort,
  ) {}

  async execute(providerId: string) {
    ensureCodexOAuthProvider(await this.providerRepository.findById(providerId));

    const existing = await this.credentialRepository.findByProviderId(providerId);
    if (!existing?.encryptedRefreshToken) {
      throw new UnauthorizedError("Provider does not have a refresh token configured");
    }

    const refreshToken = this.cipher.decrypt(existing.encryptedRefreshToken);
    let tokens: CodexOAuthTokenResponse;
    try {
      tokens = await this.deduper.run("codex", refreshToken, () => this.oauthClient.refreshToken({
        clientId: this.codexClientId,
        refreshToken,
      }), this.logger);
      await recordAuditSafely(this.auditRecorder, {
        providerId,
        providerType: "codex_subscription",
        phase: "refresh_success",
        occurredAt: nowIso(),
        data: {
          tokenResponse: summarizeTokenResponse(tokens, this.cipher.decrypt(existing.encryptedValue)),
        },
      });
    } catch (error) {
      await recordAuditSafely(this.auditRecorder, {
        providerId,
        providerType: "codex_subscription",
        phase: "refresh_failed",
        occurredAt: nowIso(),
        data: {
          error: error instanceof Error ? error.message : "OAuth refresh failed",
        },
      });
      throw error;
    }

    return upsertOauthCredential({
      providerId,
      existing,
      tokens,
      cipher: this.cipher,
      metadataJson: mergeLegacyCodexMetadata(existing.metadataJson, tokens, tokens.accessToken),
    }, this.credentialRepository);
  }
}

export class EnsureFreshProviderCredentialUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly credentialRepository: CredentialRepositoryPort,
    private readonly refreshCodexOAuthCredential: RefreshCodexOAuthCredentialUseCase,
  ) {}

  async execute(providerId: string) {
    const provider = await this.providerRepository.findById(providerId);
    if (!provider) throw new NotFoundError("Provider not found");

    const credential = await this.credentialRepository.findByProviderId(providerId);
    if (!credential) return null;
    if (provider.providerType !== "codex_subscription" || provider.accessMode !== "oauth") return credential;
    if (!shouldRefreshCredential(provider.providerType, credential)) {
      if (!credential.encryptedRefreshToken && isCredentialExpired(credential)) {
        const expired = { ...credential, loginStatus: "expired" as const, lastAuthCheckAt: nowIso(), updatedAt: nowIso() };
        await this.credentialRepository.upsert(expired);
        return expired;
      }
      return credential;
    }
    return this.refreshCodexOAuthCredential.execute(providerId);
  }
}
