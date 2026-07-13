import { createRequestLog } from "../../domain/request-log.entity.js";
import type { RequestLogRepositoryPort } from "../ports/request-log-repository.port.js";
import type { RequestLog } from "../../domain/request-log.types.js";

export class RecordRequestLogUseCase {
  constructor(private readonly repository: RequestLogRepositoryPort) {}

  async execute(input: Omit<RequestLog, "id" | "createdAt">) {
    const log = createRequestLog(input);
    await this.repository.create(log);
    return log;
  }
}
