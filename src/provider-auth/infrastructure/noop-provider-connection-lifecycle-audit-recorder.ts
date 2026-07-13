import type { ProviderConnectionLifecycleAuditEvent, ProviderConnectionLifecycleAuditPort } from "../core/ports/provider-connection-lifecycle-audit.port.js";

export class NoopProviderConnectionLifecycleAuditRecorder implements ProviderConnectionLifecycleAuditPort {
  async record(_event: ProviderConnectionLifecycleAuditEvent) {}
}
