import { GetClaudeStatusUseCase } from "../../features/claude/application/use-cases/get-claude-status.use-case.js";
import {
  CancelClaudeLocalAuthFlowUseCase,
  GetClaudeLocalAuthFlowUseCase,
  StartClaudeLocalAuthFlowUseCase,
  WriteClaudeLocalAuthFlowInputUseCase,
} from "../../features/claude/application/use-cases/manage-claude-auth-flow.use-cases.js";
import {
  DisconnectClaudeUseCase,
  GetClaudeConnectInstructionsUseCase,
  ImportClaudeSetupTokenUseCase,
  ListClaudeModelsUseCase,
  SendClaudeTestMessageUseCase,
  TestClaudeConnectionUseCase,
} from "../../features/claude/application/use-cases/manage-claude-local-facade.use-cases.js";
import type { ValidProviderCredential } from "../../provider-auth/core/provider-auth.types.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeClaudeFeature(
  context: CompositionContext,
  dependencies: {
    getValidProviderCredential: (connectionId: string) => Promise<ValidProviderCredential>;
  },
) {
  return {
    connect: new GetClaudeConnectInstructionsUseCase(
      context.providerRepository,
      context.claudeRequestAuditRecorder,
      context.claudeRuntimeSurface,
      context.claudeCliStatus,
    ),
    status: new GetClaudeStatusUseCase(
      context.providerRepository,
      context.providerConnectionRepository,
      context.claudeRuntimeSurface,
      "approved_setup_token",
      context.claudeCliStatus,
      context.claudeCliProcessSupervisor,
    ),
    subscribeLocalAuthFlow: context.claudeAuthFlowManager,
    startLocalAuthFlow: new StartClaudeLocalAuthFlowUseCase(context.claudeAuthFlowManager),
    getLocalAuthFlow: new GetClaudeLocalAuthFlowUseCase(context.claudeAuthFlowManager),
    writeLocalAuthFlowInput: new WriteClaudeLocalAuthFlowInputUseCase(context.claudeAuthFlowManager),
    cancelLocalAuthFlow: new CancelClaudeLocalAuthFlowUseCase(context.claudeAuthFlowManager),
    importToken: new ImportClaudeSetupTokenUseCase(
      context.providerRepository,
      context.providerConnectionRepository,
      context.credentialCipher,
      context.claudeRequestAuditRecorder,
      context.claudeRuntimeSurface,
    ),
    listModels: new ListClaudeModelsUseCase(
      context.providerRepository,
      context.claudeRequestAuditRecorder,
      context.claudeRuntimeSurface,
    ),
    testConnection: new TestClaudeConnectionUseCase(
      context.providerRepository,
      context.providerConnectionRepository,
      dependencies.getValidProviderCredential,
      context.adapterRegistry,
      context.claudeRequestAuditRecorder,
      context.claudeRuntimeSurface,
    ),
    testMessage: new SendClaudeTestMessageUseCase(
      context.providerRepository,
      context.providerConnectionRepository,
      dependencies.getValidProviderCredential,
      context.adapterRegistry,
      context.claudeRequestAuditRecorder,
      context.claudeRuntimeSurface,
    ),
    disconnect: new DisconnectClaudeUseCase(
      context.providerRepository,
      context.providerConnectionRepository,
    ),
  };
}
