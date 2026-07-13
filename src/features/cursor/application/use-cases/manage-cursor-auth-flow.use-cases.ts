import { AppError, NotFoundError } from "../../../../core/errors.js";
import type { CursorAuthFlowManagerPort } from "../ports/cursor-auth-flow-manager.port.js";

export class StartCursorLocalAuthFlowUseCase {
  constructor(private readonly flowManager: CursorAuthFlowManagerPort) {}

  async execute() {
    const snapshot = await this.flowManager.start();
    return {
      flowId: snapshot.flowId,
      status: snapshot.status,
      startedAt: snapshot.startedAt,
      events: snapshot.events,
    };
  }
}

export class GetCursorLocalAuthFlowUseCase {
  constructor(private readonly flowManager: CursorAuthFlowManagerPort) {}

  execute(flowId: string) {
    const snapshot = this.flowManager.get(flowId);
    if (!snapshot) throw new NotFoundError(`Cursor auth flow ${flowId} was not found`);
    return snapshot;
  }
}

export class WriteCursorLocalAuthFlowInputUseCase {
  constructor(private readonly flowManager: CursorAuthFlowManagerPort) {}

  async execute(input: { flowId: string; value: string }) {
    if (!input.value.trim()) throw new AppError("Auth flow input is required", 400, "auth_flow_input_required");
    return await this.flowManager.writeInput(input.flowId, input.value);
  }
}

export class CancelCursorLocalAuthFlowUseCase {
  constructor(private readonly flowManager: CursorAuthFlowManagerPort) {}

  async execute(flowId: string) {
    return await this.flowManager.cancel(flowId);
  }
}
