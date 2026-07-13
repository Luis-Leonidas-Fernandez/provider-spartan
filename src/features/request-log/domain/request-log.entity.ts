import { AppError } from "../../../core/errors.js";
import { nowIso } from "../../../shared/date/date.js";
import { createId } from "../../../shared/id/id.js";
import type { RequestLog } from "./request-log.types.js";

export function createRequestLog(input: Omit<RequestLog, "id" | "createdAt">): RequestLog {
  if (!input.requestId.trim()) throw new AppError("requestId is required");
  if (input.durationMs < 0) throw new AppError("durationMs must be non-negative");
  JSON.parse(input.requestMetadataJson);
  JSON.parse(input.responseMetadataJson);
  return {
    ...input,
    id: createId(),
    createdAt: nowIso(),
  };
}
