import type { RequestLog } from "../../domain/request-log.types.js";

export interface RequestLogRepositoryPort {
  create(log: RequestLog): Promise<void>;
  findAll(): Promise<RequestLog[]>;
}
