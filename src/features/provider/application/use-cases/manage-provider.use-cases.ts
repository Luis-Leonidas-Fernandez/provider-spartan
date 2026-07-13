import { NotFoundError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import type { EnsureFreshProviderCredentialUseCase } from "../../../credential/application/use-cases/manage-oauth-credential.use-cases.js";
import type { CredentialCipherService } from "../../../credential/infrastructure/credential-cipher.service.js";
import type { ProviderAdapterRegistryPort } from "../../../gateway/application/ports/provider-adapter-registry.port.js";
import type { UsageEventBusPort } from "../../../gateway/application/ports/usage-event-bus.port.js";
import { createProvider, createProviderHealth, updateProvider } from "../../domain/provider.entity.js";
import type { ProviderRepositoryPort } from "../ports/provider-repository.port.js";
import type { Provider } from "../../domain/provider.types.js";

function parseCredentialMetadata(metadataJson: string | null | undefined): Record<string, unknown> | undefined {
  if (!metadataJson) return undefined;
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class CreateProviderUseCase {
  constructor(private readonly repository: ProviderRepositoryPort) {}
  async execute(input: Omit<Provider, "id" | "createdAt" | "updatedAt">) {
    if (input.isDefault) await this.repository.clearDefault();
    const entity = createProvider(input);
    await this.repository.create(entity);
    await this.repository.upsertHealth(createProviderHealth(entity.id));
    return entity;
  }
}
export class ListProvidersUseCase { constructor(private readonly repository: ProviderRepositoryPort) {} execute(){ return this.repository.findAll(); } }
export class GetProviderUseCase { constructor(private readonly repository: ProviderRepositoryPort) {} async execute(id:string){ const entity=await this.repository.findById(id); if(!entity) throw new NotFoundError("Provider not found"); return entity; } }
export class UpdateProviderUseCase { constructor(private readonly repository: ProviderRepositoryPort) {} async execute(id:string,input:Partial<Omit<Provider,"id"|"createdAt"|"updatedAt">>){ const entity=await this.repository.findById(id); if(!entity) throw new NotFoundError("Provider not found"); if(input.isDefault) await this.repository.clearDefault(); const updated=updateProvider(entity,input); await this.repository.update(updated); return updated; } }
export class DeleteProviderUseCase { constructor(private readonly repository: ProviderRepositoryPort) {} async execute(id:string){ const entity=await this.repository.findById(id); if(!entity) throw new NotFoundError("Provider not found"); await this.repository.delete(id);} }
export class SetDefaultProviderUseCase { constructor(private readonly repository: ProviderRepositoryPort) {} async execute(id:string){ const entity=await this.repository.findById(id); if(!entity) throw new NotFoundError("Provider not found"); await this.repository.clearDefault(); const updated = updateProvider(entity, { isDefault: true }); await this.repository.update(updated); return updated; } }
export class GetProviderHealthUseCase { constructor(private readonly repository: ProviderRepositoryPort) {} async execute(id:string){ const health = await this.repository.getHealth(id); return health ?? createProviderHealth(id); } }

export class TestProviderConnectionUseCase {
  constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly ensureFreshProviderCredential: EnsureFreshProviderCredentialUseCase,
    private readonly credentialCipher: CredentialCipherService,
    private readonly adapterRegistry: ProviderAdapterRegistryPort,
    private readonly eventBus: UsageEventBusPort,
  ) {}

  async execute(id: string) {
    const provider = await this.repository.findById(id);
    if (!provider) throw new NotFoundError("Provider not found");
    const credential = await this.ensureFreshProviderCredential.execute(id);
    const credentialValue = credential ? this.credentialCipher.decrypt(credential.encryptedValue) : null;
    const credentialMetadata = parseCredentialMetadata(credential?.metadataJson);
    const adapter = this.adapterRegistry.getAdapter(provider.providerType);
    const healthBefore = await this.repository.getHealth(provider.id);
    const result = await adapter.testConnection({
      providerId: provider.id,
      providerType: provider.providerType,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      credentialValue,
      credentialMetadata,
    });
    const health = {
      ...(healthBefore ?? createProviderHealth(provider.id)),
      status: result.status,
      lastCheckedAt: nowIso(),
      lastSuccessAt: result.ok ? nowIso() : (healthBefore?.lastSuccessAt ?? null),
      lastError: result.ok ? null : result.message,
      latencyMs: result.latencyMs,
    };
    await this.repository.upsertHealth(health);
    if (healthBefore?.status !== health.status) {
      this.eventBus.emit({ type: "provider.health_changed", data: { providerId: provider.id, status: health.status } });
    }
    return result;
  }
}
