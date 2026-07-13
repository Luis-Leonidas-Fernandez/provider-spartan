import type { Provider } from "../../../features/provider/domain/provider.types.js";
import type { ProviderCredential } from "../../../features/credential/domain/credential.types.js";
import type { ProviderConnection } from "../provider-auth.types.js";
import type { ProviderAuthTokenSet } from "../provider-auth.strategy.js";

export interface LegacyProviderCredentialSyncPort {
  syncAuthenticatedConnection(input: {
    provider: string;
    providerRecord: Provider;
    connection: ProviderConnection;
    tokens: ProviderAuthTokenSet;
  }): Promise<ProviderCredential | null>;
  deleteByProviderId(providerId: string): Promise<void>;
}
