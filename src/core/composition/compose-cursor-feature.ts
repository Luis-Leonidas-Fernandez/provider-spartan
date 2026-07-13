import { GetCursorCapabilitiesUseCase, GetCursorStatusUseCase } from "../../features/cursor/application/use-cases/get-cursor-status.use-case.js";
import {
  CancelCursorLocalAuthFlowUseCase,
  GetCursorLocalAuthFlowUseCase,
  StartCursorLocalAuthFlowUseCase,
  WriteCursorLocalAuthFlowInputUseCase,
} from "../../features/cursor/application/use-cases/manage-cursor-auth-flow.use-cases.js";
import {
  GetCursorConnectInstructionsUseCase,
  ListCursorModelsUseCase,
  LogoutCursorUseCase,
  TestCursorConnectionUseCase,
  TestCursorMessageUseCase,
} from "../../features/cursor/application/use-cases/manage-cursor-convenience.use-cases.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeCursorFeature(context: CompositionContext) {
  return {
    connect: new GetCursorConnectInstructionsUseCase(context.cursorCliStatus),
    status: new GetCursorStatusUseCase(context.cursorCliStatus, context.cursorCliProcessSupervisor),
    capabilities: new GetCursorCapabilitiesUseCase(context.cursorCliStatus),
    subscribeLocalAuthFlow: context.cursorAuthFlowManager,
    startLocalAuthFlow: new StartCursorLocalAuthFlowUseCase(context.cursorAuthFlowManager),
    getLocalAuthFlow: new GetCursorLocalAuthFlowUseCase(context.cursorAuthFlowManager),
    writeLocalAuthFlowInput: new WriteCursorLocalAuthFlowInputUseCase(context.cursorAuthFlowManager),
    cancelLocalAuthFlow: new CancelCursorLocalAuthFlowUseCase(context.cursorAuthFlowManager),
    listModels: new ListCursorModelsUseCase(
      context.cursorCliStatus,
      context.cursorModelCatalog,
      context.cursorRequestAuditRecorder,
    ),
    testConnection: new TestCursorConnectionUseCase(
      context.providerRepository,
      context.cursorCliStatus,
      context.adapterRegistry,
      context.cursorRequestAuditRecorder,
    ),
    testMessage: new TestCursorMessageUseCase(
      context.providerRepository,
      context.cursorCliStatus,
      context.cursorModelCatalog,
      context.adapterRegistry,
      context.cursorRequestAuditRecorder,
    ),
    disconnect: new LogoutCursorUseCase(
      context.cursorCliStatus,
      context.cursorCliRunner,
      context.cursorCliTimeoutMs,
    ),
  };
}
