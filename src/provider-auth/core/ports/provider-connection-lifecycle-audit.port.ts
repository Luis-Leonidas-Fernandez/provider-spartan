import type { ProviderConnectionStatus } from "../provider-auth.types.js";

export type ProviderConnectionLifecycleAuditEventName =
  | "connection_started"
  | "connection_completed"
  | "connection_refreshed"
  | "connection_expired"
  | "connection_refresh_failed"
  | "connection_logged_out"
  | "connection_revoked";

export type ProviderConnectionLifecycleAuditEvent = {
  provider: string;
  providerId: string;
  connectionId: string | null;
  event: ProviderConnectionLifecycleAuditEventName;
  occurredAt: string;
  previousStatus: ProviderConnectionStatus | null;
  nextStatus: ProviderConnectionStatus | null;
  data: Record<string, unknown>;
};

export interface ProviderConnectionLifecycleAuditPort {
  record(event: ProviderConnectionLifecycleAuditEvent): Promise<void>;
}
