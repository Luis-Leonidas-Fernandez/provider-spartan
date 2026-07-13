import type { CredentialRepositoryPort } from "../../../features/credential/application/ports/credential-repository.port.js";
import type { CredentialCipherPort } from "../../../features/credential/application/ports/credential-cipher.port.js";
import { mergeLegacyCodexMetadata, upsertOauthCredential } from "../../../features/credential/application/use-cases/manage-oauth-credential.use-cases.js";
import type { LegacyProviderCredentialSyncPort } from "../../core/ports/legacy-provider-credential-sync.port.js";

export class CodexLegacyCredentialSyncAdapter implements LegacyProviderCredentialSyncPort {
  constructor(
    private readonly credentialRepository: CredentialRepositoryPort,
    private readonly cipher: CredentialCipherPort,
  ) {}

  async syncAuthenticatedConnection(input: Parameters<LegacyProviderCredentialSyncPort["syncAuthenticatedConnection"]>[0]) {
    if (input.provider !== "codex") return null;

    const existing = await this.credentialRepository.findByProviderId(input.providerRecord.id);
    return upsertOauthCredential({
      providerId: input.providerRecord.id,
      existing,
      tokens: {
        accessToken: input.tokens.accessToken,
        refreshToken: input.tokens.refreshToken ?? null,
        idToken: input.tokens.idToken ?? null,
        expiresIn: input.tokens.expiresIn,
      },
      cipher: this.cipher,
      metadataJson: mergeLegacyCodexMetadata(
        existing?.metadataJson,
        {
          accessToken: input.tokens.accessToken,
          refreshToken: input.tokens.refreshToken ?? null,
          idToken: input.tokens.idToken ?? null,
          expiresIn: input.tokens.expiresIn,
        },
        input.tokens.accessToken,
      ),
    }, this.credentialRepository);
  }

  async deleteByProviderId(providerId: string) {
    await this.credentialRepository.deleteByProviderId(providerId);
  }
}
