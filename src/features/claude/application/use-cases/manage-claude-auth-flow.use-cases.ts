import { AppError, NotFoundError } from "../../../../core/errors.js";
import type { ClaudeAuthFlowManagerPort } from "../ports/claude-auth-flow-manager.port.js";

export class StartClaudeLocalAuthFlowUseCase {
  constructor(private readonly flowManager: ClaudeAuthFlowManagerPort) {}

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

export class GetClaudeLocalAuthFlowUseCase {
  constructor(private readonly flowManager: ClaudeAuthFlowManagerPort) {}

  execute(flowId: string) {
    const snapshot = this.flowManager.get(flowId);
    if (!snapshot) throw new NotFoundError(`Claude auth flow ${flowId} was not found`);
    return snapshot;
  }
}

export class WriteClaudeLocalAuthFlowInputUseCase {
  constructor(private readonly flowManager: ClaudeAuthFlowManagerPort) {}

  async execute(input: { flowId: string; value: string }) {
    if (!input.value.trim()) throw new AppError("Auth flow input is required", 400, "auth_flow_input_required");
    return await this.flowManager.writeInput(input.flowId, input.value);
  }
}

export class CancelClaudeLocalAuthFlowUseCase {
  constructor(private readonly flowManager: ClaudeAuthFlowManagerPort) {}

  async execute(flowId: string) {
    return await this.flowManager.cancel(flowId);
  }
}
