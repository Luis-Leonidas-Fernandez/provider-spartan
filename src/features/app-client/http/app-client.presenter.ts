import type { AppClient } from "../domain/app-client.types.js";

export function presentAppClient(entity: AppClient) {
  const { apiKeyHash, ...safe } = entity;
  void apiKeyHash;
  return safe;
}
