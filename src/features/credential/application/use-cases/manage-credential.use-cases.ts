import { NotFoundError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import { createProviderCredential } from "../../domain/credential.entity.js";
import type { CredentialRepositoryPort } from "../ports/credential-repository.port.js";
import type { CredentialCipherPort } from "../ports/credential-cipher.port.js";
import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { CredentialType, ProviderCredential } from "../../domain/credential.types.js";

export class StoreProviderCredentialUseCase {
  constructor(
    private readonly repository: CredentialRepositoryPort,
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly cipher: CredentialCipherPort,
  ) {}

  async execute(input: { providerId: string; credentialType: CredentialType; secret: string; refreshToken?: string | null | undefined; idToken?: string | null | undefined; metadataJson?: string | null | undefined; tokenExpiresAt?: string | null | undefined; refreshTokenExists?: boolean | undefined; loginStatus?: ProviderCredential["loginStatus"] | undefined }) {
    const provider = await this.providerRepository.findById(input.providerId);
    if (!provider) throw new NotFoundError("Provider not found");
    const encrypted = this.cipher.encrypt(input.secret);
    const encryptedRefreshToken = input.refreshToken ? this.cipher.encrypt(input.refreshToken).encryptedValue : null;
    const encryptedIdToken = input.idToken ? this.cipher.encrypt(input.idToken).encryptedValue : null;
    const existing = await this.repository.findByProviderId(input.providerId);
    const entity = createProviderCredential({
      providerId: input.providerId,
      credentialType: input.credentialType,
      encryptedValue: encrypted.encryptedValue,
      encryptedRefreshToken,
      encryptedIdToken,
      maskedValue: encrypted.maskedValue,
      metadataJson: input.metadataJson ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      lastRefreshAt: input.credentialType === "oauth_token" ? nowIso() : null,
      refreshTokenExists: input.refreshTokenExists ?? false,
      loginStatus: input.loginStatus ?? "authenticated",
      lastAuthCheckAt: nowIso(),
    });
    await this.repository.upsert(existing ? { ...existing, ...entity, id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() } : entity);
    return await this.repository.findByProviderId(input.providerId);
  }
}
export class GetProviderCredentialStatusUseCase { constructor(private readonly repository: CredentialRepositoryPort) {} execute(providerId:string){ return this.repository.findByProviderId(providerId); } }
export class DeleteProviderCredentialUseCase { constructor(private readonly repository: CredentialRepositoryPort) {} execute(providerId:string){ return this.repository.deleteByProviderId(providerId); } }
