import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { Provider } from "../../../provider/domain/provider.types.js";
import { createProvider, createProviderHealth } from "../../../provider/domain/provider.entity.js";

export function findDefaultCursorProvider(providers: Provider[]) {
  return providers.find((provider) =>
    provider.providerType === "cursor"
    && provider.accessMode === "local"
    && provider.isEnabled,
  ) ?? null;
}

export async function ensureDefaultCursorProvider(providerRepository: ProviderRepositoryPort) {
  const providers = await providerRepository.findAll();
  const existing = findDefaultCursorProvider(providers);
  if (existing) return existing;
  const provider = createProvider({
    name: "Cursor CLI Subscription",
    providerType: "cursor",
    accessMode: "local",
    baseUrl: null,
    defaultModel: null,
    isEnabled: true,
    isDefault: false,
    supportsUsageReporting: false,
    supportsStreaming: false,
    pricingJson: null,
    notes: "Auto-created by the Cursor local runtime facade.",
  });
  await providerRepository.create(provider);
  await providerRepository.upsertHealth(createProviderHealth(provider.id));
  return provider;
}
