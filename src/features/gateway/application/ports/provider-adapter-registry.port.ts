import type { ProviderType } from "../../../provider/domain/provider.types.js";
import type { ProviderAdapter } from "../../../../shared/provider-runtime/provider-adapter.js";

export interface ProviderAdapterRegistryPort {
  getAdapter(providerType: ProviderType): ProviderAdapter;
}
