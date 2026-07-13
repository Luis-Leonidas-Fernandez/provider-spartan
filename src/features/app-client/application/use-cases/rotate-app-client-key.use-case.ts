import { NotFoundError } from "../../../../core/errors.js";
import type { AppClientRepositoryPort } from "../ports/app-client-repository.port.js";
import type { ApiKeyHasherPort } from "../ports/api-key-hasher.port.js";
import { nowIso } from "../../../../shared/date/date.js";

export class RotateAppClientKeyUseCase {
  constructor(
    private readonly repository: AppClientRepositoryPort,
    private readonly hasher: ApiKeyHasherPort,
  ) {}

  async execute(id: string) {
    const entity = await this.repository.findById(id);
    if (!entity) throw new NotFoundError("App client not found");
    const key = this.hasher.generateApiKey();
    await this.repository.update({
      ...entity,
      apiKeyHash: key.apiKeyHash,
      apiKeyPrefix: key.apiKeyPrefix,
      apiKeyLastFour: key.apiKeyLastFour,
      updatedAt: nowIso(),
    });
    return key.apiKey;
  }
}
