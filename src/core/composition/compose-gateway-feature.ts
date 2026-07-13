import { AuthenticateGatewayRequestUseCase } from "../../features/gateway/application/use-cases/authenticate-gateway-request.use-case.js";
import { HandleChatCompletionUseCase } from "../../features/gateway/application/use-cases/handle-chat-completion.use-case.js";
import { ParseProviderModelUseCase } from "../../features/gateway/application/use-cases/parse-provider-model.use-case.js";
import { RecordRequestLogUseCase } from "../../features/request-log/application/use-cases/record-request-log.use-case.js";
import { RecordUsageEventUseCase } from "../../features/usage/application/use-cases/record-usage-event.use-case.js";
import type { ValidateAppClientKeyUseCase } from "../../features/app-client/application/use-cases/validate-app-client-key.use-case.js";
import type { EnsureFreshProviderCredentialUseCase } from "../../features/credential/application/use-cases/manage-oauth-credential.use-cases.js";
import type { ProviderConnection, ValidProviderCredential } from "../../provider-auth/core/provider-auth.types.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeGatewayFeature(
  context: CompositionContext,
  dependencies: {
    validateKey: ValidateAppClientKeyUseCase;
    ensureFresh: EnsureFreshProviderCredentialUseCase;
    getDefaultProviderConnectionByProviderId?: (providerId: string) => Promise<ProviderConnection | null>;
    getDefaultProviderAuthStatus?: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>;
    getValidProviderCredential?: (connectionId: string) => Promise<ValidProviderCredential>;
  },
) {
  const recordUsageEvent = new RecordUsageEventUseCase(context.usageEventRepository);
  const recordRequestLog = new RecordRequestLogUseCase(context.requestLogRepository);
  const parseProviderModel = new ParseProviderModelUseCase();

  return {
    authenticateRequest: new AuthenticateGatewayRequestUseCase(dependencies.validateKey, context.appClientRepository),
    parseProviderModel,
    handleChatCompletion: new HandleChatCompletionUseCase(
      dependencies.validateKey,
      context.appClientRepository,
      context.appSubscriptionRepository,
      context.providerRepository,
      dependencies.ensureFresh,
      context.credentialCipher,
      context.adapterRegistry,
      parseProviderModel,
      context.usageTracker,
      { record: async (event) => { await recordUsageEvent.execute(event); } },
      { record: async (log) => { await recordRequestLog.execute(log); } },
      context.eventBus,
      dependencies.getDefaultProviderConnectionByProviderId,
      dependencies.getDefaultProviderAuthStatus,
      dependencies.getValidProviderCredential,
    ),
  };
}
