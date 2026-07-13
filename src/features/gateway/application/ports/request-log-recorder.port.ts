import type { RequestLog } from "../../../request-log/domain/request-log.types.js";

export interface RequestLogRecorderPort {
  record(log: RequestLog): Promise<void>;
}
