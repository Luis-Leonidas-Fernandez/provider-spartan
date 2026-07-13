import { CreateProviderUseCase, DeleteProviderUseCase, GetProviderHealthUseCase, GetProviderUseCase, ListProvidersUseCase, SetDefaultProviderUseCase, TestProviderConnectionUseCase, UpdateProviderUseCase } from "../../features/provider/application/use-cases/manage-provider.use-cases.js";
import type { EnsureFreshProviderCredentialUseCase } from "../../features/credential/application/use-cases/manage-oauth-credential.use-cases.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeProviderFeature(
  context: CompositionContext,
  dependencies: { ensureFresh: EnsureFreshProviderCredentialUseCase },
) {
  return {
    create: new CreateProviderUseCase(context.providerRepository),
    list: new ListProvidersUseCase(context.providerRepository),
    get: new GetProviderUseCase(context.providerRepository),
    update: new UpdateProviderUseCase(context.providerRepository),
    delete: new DeleteProviderUseCase(context.providerRepository),
    setDefault: new SetDefaultProviderUseCase(context.providerRepository),
    getHealth: new GetProviderHealthUseCase(context.providerRepository),
    testConnection: new TestProviderConnectionUseCase(
      context.providerRepository,
      dependencies.ensureFresh,
      context.credentialCipher,
      context.adapterRegistry,
      context.eventBus,
    ),
  };
}
