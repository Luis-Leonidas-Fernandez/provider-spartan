import { AppError } from "../../../core/errors.js";
import type { ProviderType } from "../../provider/domain/provider.types.js";
import type { ProviderAdapter } from "../../../shared/provider-runtime/provider-adapter.js";
import type { ProviderAdapterRegistryPort } from "../application/ports/provider-adapter-registry.port.js";

export class ProviderAdapterRegistry implements ProviderAdapterRegistryPort {
  constructor(private readonly adapters: ProviderAdapter[]) {}

  getAdapter(providerType: ProviderType): ProviderAdapter {
    const adapter = this.adapters.find((item) => item.providerType === providerType);
    if (!adapter) throw new AppError(`No adapter registered for provider type ${providerType}`, 500, "provider_adapter_missing");
    return adapter;
  }
}
