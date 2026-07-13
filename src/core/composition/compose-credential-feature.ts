import { DeleteProviderCredentialUseCase, GetProviderCredentialStatusUseCase, StoreProviderCredentialUseCase } from "../../features/credential/application/use-cases/manage-credential.use-cases.js";
import { CompleteCodexOAuthByStateUseCase, CompleteCodexOAuthUseCase, DisconnectDefaultCodexOAuthUseCase, EnsureFreshProviderCredentialUseCase, RefreshCodexOAuthCredentialUseCase, StartCodexOAuthUseCase, StartDefaultCodexOAuthUseCase } from "../../features/credential/application/use-cases/manage-oauth-credential.use-cases.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeCredentialFeature(context: CompositionContext) {
  const refreshOauth = new RefreshCodexOAuthCredentialUseCase(
    context.providerRepository,
    context.credentialRepository,
    context.credentialCipher,
    context.codexOAuthClient,
    context.codexClientId,
    context.refreshDeduper,
    context.logger,
    context.oauthAuditRecorder,
  );

  const startOauth = new StartCodexOAuthUseCase(
    context.providerRepository,
    context.oauthSessionRepository,
    context.codexOAuthClient,
    context.codexClientId,
    context.oauthAuditRecorder,
  );

  const completeOauth = new CompleteCodexOAuthUseCase(
    context.providerRepository,
    context.oauthSessionRepository,
    context.credentialRepository,
    context.credentialCipher,
    context.codexOAuthClient,
    context.codexClientId,
    context.oauthAuditRecorder,
  );

  const ensureFresh = new EnsureFreshProviderCredentialUseCase(
    context.providerRepository,
    context.credentialRepository,
    refreshOauth,
  );

  return {
    store: new StoreProviderCredentialUseCase(context.credentialRepository, context.providerRepository, context.credentialCipher),
    getStatus: new GetProviderCredentialStatusUseCase(context.credentialRepository),
    delete: new DeleteProviderCredentialUseCase(context.credentialRepository),
    startOauth,
    startDefaultCodexOauth: new StartDefaultCodexOAuthUseCase(context.providerRepository, startOauth),
    disconnectDefaultCodexOauth: new DisconnectDefaultCodexOAuthUseCase(
      context.providerRepository,
      context.credentialRepository,
      context.oauthSessionRepository,
    ),
    completeOauth,
    completeOauthByState: new CompleteCodexOAuthByStateUseCase(context.oauthSessionRepository, completeOauth),
    refreshOauth,
    ensureFresh,
  };
}
