import { eq } from "drizzle-orm";
import type { ProviderGatewayDrizzleDb } from "../../../core/database.js";
import type { CredentialRepositoryPort } from "../application/ports/credential-repository.port.js";
import type { ProviderCredential } from "../domain/credential.types.js";
import { providerCredentialsTable } from "./provider-credential.table.js";

export class DrizzleCredentialRepository implements CredentialRepositoryPort {
  constructor(private readonly db: ProviderGatewayDrizzleDb) {}
  async upsert(entity: ProviderCredential) { this.db.insert(providerCredentialsTable).values(entity).onConflictDoUpdate({ target: providerCredentialsTable.providerId, set: entity }).run(); }
  async findByProviderId(providerId: string) { return (this.db.select().from(providerCredentialsTable).where(eq(providerCredentialsTable.providerId, providerId)).get() as ProviderCredential | undefined) ?? null; }
  async deleteByProviderId(providerId: string) { this.db.delete(providerCredentialsTable).where(eq(providerCredentialsTable.providerId, providerId)).run(); }
}
