import type { AppClientRepositoryPort } from "../ports/app-client-repository.port.js";

export class ListAppClientsUseCase {
  constructor(private readonly repository: AppClientRepositoryPort) {}

  execute() {
    return this.repository.findAll();
  }
}
