import { getConfig } from "../core/config.js";
import { createProviderGatewayModule } from "../core/create-provider-gateway-module.js";

export { type ProviderGatewayModule as Container } from "../core/create-provider-gateway-module.js";

export function createContainer() {
  const config = getConfig();
  return createProviderGatewayModule({
    appEnv: config.appEnv,
    logLevel: config.logLevel,
    databaseUrl: config.databaseUrl,
    appApiKeyPepper: config.appApiKeyPepper,
    credentialEncryptionKey: config.credentialEncryptionKey,
    providerAuthRefreshSkewMs: config.providerAuthRefreshSkewMs,
    providerAuthLifecycleAuditDir: config.providerAuthLifecycleAuditDir,
    allowInsecureCredentialStorage: config.allowInsecureCredentialStorage,
  });
}
