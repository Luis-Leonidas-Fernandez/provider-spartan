import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { RequestLogRepositoryPort } from "../application/ports/request-log-repository.port.js";
import type { RequestLog } from "../domain/request-log.types.js";
import { requestLogsTable } from "./request-log.table.js";

export class DrizzleRequestLogRepository implements RequestLogRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}

  async create(log: RequestLog) {
    this.db.insert(requestLogsTable).values(log).run();
  }

  async findAll() {
    return this.db.select().from(requestLogsTable).all() as RequestLog[];
  }
}
