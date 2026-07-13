import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { Provider } from "../../../provider/domain/provider.types.js";
import { createProvider, createProviderHealth } from "../../../provider/domain/provider.entity.js";

export function findDefaultClaudeProvider(providers: Provider[]) {
  return providers.find((provider) =>
    provider.providerType === "claude"
    && provider.accessMode === "custom"
    && provider.isEnabled,
  ) ?? null;
}

export async function ensureDefaultClaudeProvider(providerRepository: ProviderRepositoryPort) {
  const providers = await providerRepository.findAll();
  const existing = findDefaultClaudeProvider(providers);
  if (existing) return existing;
  const provider = createProvider({
    name: "Claude Code Setup Token",
    providerType: "claude",
    accessMode: "custom",
    baseUrl: null,
    defaultModel: "sonnet",
    isEnabled: true,
    isDefault: false,
    supportsUsageReporting: false,
    supportsStreaming: false,
    pricingJson: null,
    notes: "Auto-created by the Claude local runtime facade.",
  });
  await providerRepository.create(provider);
  await providerRepository.upsertHealth(createProviderHealth(provider.id));
  return provider;
}
