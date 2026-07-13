import { AppError, NotFoundError } from "../../../../core/errors.js";
import type { AntigravityAuthFlowManagerPort } from "../ports/antigravity-auth-flow-manager.port.js";

export class StartGeminiLocalAuthFlowUseCase {
  constructor(private readonly flowManager: AntigravityAuthFlowManagerPort) {}

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

export class GetGeminiLocalAuthFlowUseCase {
  constructor(private readonly flowManager: AntigravityAuthFlowManagerPort) {}

  execute(flowId: string) {
    const snapshot = this.flowManager.get(flowId);
    if (!snapshot) throw new NotFoundError(`Gemini auth flow ${flowId} was not found`);
    return snapshot;
  }
}

export class WriteGeminiLocalAuthFlowInputUseCase {
  constructor(private readonly flowManager: AntigravityAuthFlowManagerPort) {}

  async execute(input: { flowId: string; value: string }) {
    if (!input.value.trim()) throw new AppError("Auth flow input is required", 400, "auth_flow_input_required");
    return await this.flowManager.writeInput(input.flowId, input.value);
  }
}

export class CancelGeminiLocalAuthFlowUseCase {
  constructor(private readonly flowManager: AntigravityAuthFlowManagerPort) {}

  async execute(flowId: string) {
    return await this.flowManager.cancel(flowId);
  }
}
