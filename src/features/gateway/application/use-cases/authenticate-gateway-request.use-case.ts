import { UnauthorizedError } from "../../../../core/errors.js";
import { nowIso } from "../../../../shared/date/date.js";
import type { AppClientRepositoryPort } from "../../../app-client/application/ports/app-client-repository.port.js";
import type { ValidateAppClientKeyUseCase } from "../../../app-client/application/use-cases/validate-app-client-key.use-case.js";

export class AuthenticateGatewayRequestUseCase {
  constructor(
    private readonly validateAppClientKey: ValidateAppClientKeyUseCase,
    private readonly appClientRepository: AppClientRepositoryPort,
  ) {}

  async execute(authorizationHeader: string | undefined) {
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token");
    }
    const apiKey = authorizationHeader.slice("Bearer ".length).trim();
    const appClient = await this.validateAppClientKey.execute(apiKey);
    await this.appClientRepository.touchLastUsedAt(appClient.id, nowIso());
    return appClient;
  }
}
