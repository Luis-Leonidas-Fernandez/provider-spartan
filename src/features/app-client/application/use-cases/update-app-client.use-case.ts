import { NotFoundError } from "../../../../core/errors.js";
import { updateAppClient } from "../../domain/app-client.entity.js";
import type { UpdateAppClientInput } from "../../domain/app-client.types.js";
import type { AppClientRepositoryPort } from "../ports/app-client-repository.port.js";

export class UpdateAppClientUseCase {
  constructor(private readonly repository: AppClientRepositoryPort) {}

  async execute(input: UpdateAppClientInput) {
    const entity = await this.repository.findById(input.id);
    if (!entity) throw new NotFoundError("App client not found");
    const updated = updateAppClient(entity, input);
    await this.repository.update(updated);
    return updated;
  }
}
