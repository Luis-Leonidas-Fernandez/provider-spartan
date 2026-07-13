import { createAppClient } from "../../domain/app-client.entity.js";
import type { CreateAppClientInput } from "../../domain/app-client.types.js";
import type { AppClientRepositoryPort } from "../ports/app-client-repository.port.js";
import type { ApiKeyHasherPort } from "../ports/api-key-hasher.port.js";

export class CreateAppClientUseCase {
  constructor(
    private readonly repository: AppClientRepositoryPort,
    private readonly hasher: ApiKeyHasherPort,
  ) {}

  async execute(input: CreateAppClientInput) {
    const key = this.hasher.generateApiKey();
    const entity = createAppClient({ ...input, ...key });
    await this.repository.create(entity);
    return {
      entity,
      apiKey: key.apiKey,
    };
  }
}
