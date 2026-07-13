import { UnauthorizedError } from "../../../../core/errors.js";
import { AppClientInactiveError } from "../../domain/app-client.errors.js";
import type { AppClientRepositoryPort } from "../ports/app-client-repository.port.js";
import type { ApiKeyHasherPort } from "../ports/api-key-hasher.port.js";

export class ValidateAppClientKeyUseCase {
  constructor(
    private readonly repository: AppClientRepositoryPort,
    private readonly hasher: ApiKeyHasherPort,
  ) {}

  async execute(apiKey: string) {
    const prefix = apiKey.slice(0, 8);
    const entity = await this.repository.findByApiKeyPrefix(prefix);
    if (!entity) throw new UnauthorizedError("Invalid API key");
    if (!entity.isActive) throw new AppClientInactiveError();
    if (!this.hasher.verify(apiKey, entity.apiKeyHash)) throw new UnauthorizedError("Invalid API key");
    return entity;
  }
}
