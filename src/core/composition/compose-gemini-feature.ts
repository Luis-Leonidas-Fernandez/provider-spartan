import { GetGeminiAuthStatusUseCase, GetGeminiCapabilitiesUseCase } from "../../features/gemini/application/use-cases/get-gemini-auth-status.use-case.js";
import {
  ListGeminiModelsUseCase,
  SendGeminiTestMessageUseCase,
  TestGeminiConnectionUseCase,
} from "../../features/gemini/application/use-cases/manage-gemini-convenience.use-cases.js";
import {
  CancelGeminiLocalAuthFlowUseCase,
  GetGeminiLocalAuthFlowUseCase,
  StartGeminiLocalAuthFlowUseCase,
  WriteGeminiLocalAuthFlowInputUseCase,
} from "../../features/gemini/application/use-cases/manage-gemini-auth-flow.use-cases.js";
import type { ProviderConnection, ValidProviderCredential } from "../../provider-auth/core/provider-auth.types.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeGeminiFeature(
  context: CompositionContext,
  dependencies: {
    getDefaultProviderAuthStatus: (input: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>;
    getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>;
  },
) {
  return {
    status: new GetGeminiAuthStatusUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      context.geminiRuntimeSurface,
      context.antigravityCliStatus,
      context.localCliProcessSupervisor,
    ),
    capabilities: new GetGeminiCapabilitiesUseCase(context.antigravityCliStatus),
    subscribeLocalAuthFlow: context.antigravityAuthFlowManager,
    startLocalAuthFlow: new StartGeminiLocalAuthFlowUseCase(context.antigravityAuthFlowManager),
    getLocalAuthFlow: new GetGeminiLocalAuthFlowUseCase(context.antigravityAuthFlowManager),
    writeLocalAuthFlowInput: new WriteGeminiLocalAuthFlowInputUseCase(context.antigravityAuthFlowManager),
    cancelLocalAuthFlow: new CancelGeminiLocalAuthFlowUseCase(context.antigravityAuthFlowManager),
    testConnection: new TestGeminiConnectionUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      dependencies.getValidProviderCredential,
      context.providerConnectionRepository,
      context.adapterRegistry,
      context.geminiRequestAuditRecorder,
      context.geminiRuntimeSurface,
    ),
    testMessage: new SendGeminiTestMessageUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      dependencies.getValidProviderCredential,
      context.providerConnectionRepository,
      context.adapterRegistry,
      context.geminiRequestAuditRecorder,
      context.geminiRuntimeSurface,
      context.geminiModelCatalog,
    ),
    listModels: new ListGeminiModelsUseCase(
      context.providerRepository,
      dependencies.getDefaultProviderAuthStatus,
      context.geminiRuntimeSurface,
      context.geminiModelCatalog,
      context.geminiRequestAuditRecorder,
    ),
  };
}
