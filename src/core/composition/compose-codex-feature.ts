import { GetCodexStatusUseCase, ListCodexModelsUseCase, SendCodexTestMessageUseCase, TestCodexConnectionUseCase } from "../../features/codex/application/use-cases/manage-codex-convenience.use-cases.js";
import type { ProviderConnection, ValidProviderCredential } from "../../provider-auth/core/provider-auth.types.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeCodexFeature(
  context: CompositionContext,
  dependencies: {
    getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>;
    getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>;
  },
) {
  return {
    status: new GetCodexStatusUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      context.codexAccountModelDiscoveryReader,
    ),
    listModels: new ListCodexModelsUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      context.codexAccountModelDiscoveryReader,
    ),
    testConnection: new TestCodexConnectionUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      dependencies.getValidProviderCredential,
      context.adapterRegistry,
    ),
    testMessage: new SendCodexTestMessageUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      dependencies.getValidProviderCredential,
      context.adapterRegistry,
      context.codexRequestAuditRecorder,
      context.codexAccountModelDiscoveryReader,
    ),
  };
}
