import type { ProviderCredential } from "../../../credential/domain/credential.types.js";
import type { CredentialCipherService } from "../../../credential/infrastructure/credential-cipher.service.js";
import type { ProviderConnection, ValidProviderCredential } from "../../../../provider-auth/core/provider-auth.types.js";
import { parseMetadata } from "../../../../provider-auth/core/provider-auth.utils.js";
import type { Provider } from "../../../provider/domain/provider.types.js";

export type ResolvedProviderRuntimeCredential = {
  credentialValue: string | null;
  credentialMetadata?: Record<string, unknown>;
  source: "legacy_credential" | "provider_auth";
};

function withOptionalMetadata<T extends { credentialValue: string | null; source: "legacy_credential" | "provider_auth" }>(
  value: T,
  credentialMetadata: Record<string, unknown> | undefined,
): ResolvedProviderRuntimeCredential {
  return credentialMetadata
    ? { ...value, credentialMetadata }
    : value;
}

function isProviderAuthManaged(provider: Provider) {
  return provider.providerType === "codex_subscription"
    || provider.providerType === "gemini"
    || provider.providerType === "claude";
}

function parseLegacyCredentialMetadata(credential: ProviderCredential | null) {
  if (!credential?.metadataJson) return undefined;
  try {
    const parsed = JSON.parse(credential.metadataJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveProviderRuntimeCredential(input: {
  provider: Provider;
  legacyCredential: ProviderCredential | null;
  credentialCipher: CredentialCipherService;
  getDefaultProviderAuthStatus?: ((args: { provider: string; providerId?: string }) => Promise<ProviderConnection | null>) | undefined;
  getDefaultProviderConnectionByProviderId?: ((providerId: string) => Promise<ProviderConnection | null>) | undefined;
  getValidProviderCredential?: ((connectionId: string) => Promise<ValidProviderCredential>) | undefined;
}): Promise<ResolvedProviderRuntimeCredential | null> {
  if (input.legacyCredential) {
    return withOptionalMetadata({
      credentialValue: input.credentialCipher.decrypt(input.legacyCredential.encryptedValue),
      source: "legacy_credential",
    }, parseLegacyCredentialMetadata(input.legacyCredential));
  }

  if (!isProviderAuthManaged(input.provider)) {
    return null;
  }

  const connection = input.getDefaultProviderConnectionByProviderId
    ? await input.getDefaultProviderConnectionByProviderId(input.provider.id)
    : input.getDefaultProviderAuthStatus
      ? await input.getDefaultProviderAuthStatus({
          provider: input.provider.providerType,
          providerId: input.provider.id,
        })
      : null;
  if (!connection) return null;

  const metadata = parseMetadata(connection.metadataJson) as Record<string, unknown> | undefined;
  const authMethod = typeof metadata?.authMethod === "string" ? metadata.authMethod : null;

  if (authMethod === "claude-subscription-local-cli") {
    return withOptionalMetadata({
      credentialValue: null,
      source: "provider_auth",
    }, metadata);
  }

  if (!input.getValidProviderCredential) return null;
  const valid = await input.getValidProviderCredential(connection.id);
  return withOptionalMetadata({
    credentialValue: valid.accessToken ?? valid.bearerToken ?? valid.apiKey ?? null,
    source: "provider_auth",
  }, (valid.metadata as Record<string, unknown> | undefined) ?? metadata);
}
