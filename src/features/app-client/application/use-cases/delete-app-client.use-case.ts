import { NotFoundError } from "../../../../core/errors.js";
import type { AppClientRepositoryPort } from "../ports/app-client-repository.port.js";

export class DeleteAppClientUseCase {
  constructor(private readonly repository: AppClientRepositoryPort) {}

  async execute(id: string) {
    const entity = await this.repository.findById(id);
    if (!entity) throw new NotFoundError("App client not found");
    await this.repository.delete(id);
  }
}
