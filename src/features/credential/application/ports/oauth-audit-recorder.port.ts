export type OAuthAuditEvent = {
  providerId: string;
  providerType: "codex_subscription";
  phase: "start" | "exchange_success" | "exchange_failed" | "refresh_success" | "refresh_failed";
  occurredAt: string;
  data: Record<string, unknown>;
};

export interface OAuthAuditRecorderPort {
  record(event: OAuthAuditEvent): Promise<void>;
}
