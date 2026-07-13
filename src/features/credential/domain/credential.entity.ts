import { createId } from "../../../shared/id/id.js";
import { nowIso } from "../../../shared/date/date.js";
import type { ProviderCredential, ProviderOAuthSession } from "./credential.types.js";

export function createProviderCredential(input: Omit<ProviderCredential, "id" | "createdAt" | "updatedAt">): ProviderCredential {
  const timestamp = nowIso();
  return { ...input, id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function createProviderOAuthSession(input: Omit<ProviderOAuthSession, "id" | "createdAt">): ProviderOAuthSession {
  return { ...input, id: createId(), createdAt: nowIso() };
}
