import { AppError } from "../../../core/errors.js";
import { createId } from "../../../shared/id/id.js";
import { nowIso } from "../../../shared/date/date.js";
import type { AppClient, CreateAppClientInput, UpdateAppClientInput } from "./app-client.types.js";

export function createAppClient(props: CreateAppClientInput & {
  apiKeyHash: string;
  apiKeyPrefix: string;
  apiKeyLastFour: string;
}): AppClient {
  if (!props.name.trim()) throw new AppError("App client name is required");
  const timestamp = nowIso();
  return {
    id: createId(),
    name: props.name.trim(),
    description: props.description?.trim() || null,
    apiKeyHash: props.apiKeyHash,
    apiKeyPrefix: props.apiKeyPrefix,
    apiKeyLastFour: props.apiKeyLastFour,
    isActive: true,
    lastUsedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateAppClient(entity: AppClient, input: UpdateAppClientInput): AppClient {
  return {
    ...entity,
    name: input.name?.trim() || entity.name,
    description: input.description === undefined ? entity.description : (input.description?.trim() || null),
    isActive: input.isActive ?? entity.isActive,
    updatedAt: nowIso(),
  };
}
