import { createId } from "../../../shared/id/id.js";
import { nowIso } from "../../../shared/date/date.js";
import type { ProviderRepositoryPort } from "../../../features/provider/application/ports/provider-repository.port.js";
import type { OAuthStateStorePort } from "../ports/oauth-state-store.port.js";
import type { ProviderConnectionLifecycleAuditPort } from "../ports/provider-connection-lifecycle-audit.port.js";
import type { ProviderAuthStrategyRegistry } from "../provider-auth-strategy-registry.js";
import type { StartProviderAuthInput } from "../provider-auth.types.js";
import { resolveProviderRecord } from "../provider-auth.utils.js";

const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export class StartProviderAuthUseCase {
  constructor(
    private readonly strategyRegistry: ProviderAuthStrategyRegistry,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly stateStore: OAuthStateStorePort,
    private readonly lifecycleAuditRecorder?: ProviderConnectionLifecycleAuditPort,
  ) {}

  async execute(input: StartProviderAuthInput) {
    const { provider, strategy } = await resolveProviderRecord(this.providerRepository, this.strategyRegistry, input);
    await this.stateStore.deleteExpired(nowIso());
    await this.stateStore.deleteByProviderId(provider.id);

    const pkce = strategy.generatePkce();
    const started = strategy.start({
      ...input,
      providerId: provider.id,
      codeChallenge: pkce.codeChallenge,
      state: pkce.state,
    });

    const oauthState = {
      id: createId(),
      providerId: provider.id,
      providerType: input.provider,
      state: pkce.state,
      codeVerifier: pkce.codeVerifier,
      redirectUri: started.redirectUri,
      expiresAt: new Date(Date.now() + DEFAULT_OAUTH_STATE_TTL_MS).toISOString(),
      createdAt: nowIso(),
    };

    await this.stateStore.create(oauthState);
    await this.lifecycleAuditRecorder?.record({
      provider: input.provider,
      providerId: provider.id,
      connectionId: null,
      event: "connection_started",
      occurredAt: oauthState.createdAt,
      previousStatus: null,
      nextStatus: "pending",
      data: {
        callbackMode: input.callbackMode ?? "local-cli",
      },
    });

    return {
      providerId: provider.id,
      authorizationUrl: started.authorizationUrl,
      state: pkce.state,
      expiresAt: oauthState.expiresAt,
    };
  }
}
