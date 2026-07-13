import { CreateAppClientUseCase } from "../../features/app-client/application/use-cases/create-app-client.use-case.js";
import { DeleteAppClientUseCase } from "../../features/app-client/application/use-cases/delete-app-client.use-case.js";
import { ListAppClientsUseCase } from "../../features/app-client/application/use-cases/list-app-clients.use-case.js";
import { RotateAppClientKeyUseCase } from "../../features/app-client/application/use-cases/rotate-app-client-key.use-case.js";
import { UpdateAppClientUseCase } from "../../features/app-client/application/use-cases/update-app-client.use-case.js";
import { ValidateAppClientKeyUseCase } from "../../features/app-client/application/use-cases/validate-app-client-key.use-case.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeAppClientFeature(context: CompositionContext) {
  const validateKey = new ValidateAppClientKeyUseCase(context.appClientRepository, context.appClientHasher);

  return {
    create: new CreateAppClientUseCase(context.appClientRepository, context.appClientHasher),
    rotateKey: new RotateAppClientKeyUseCase(context.appClientRepository, context.appClientHasher),
    validateKey,
    list: new ListAppClientsUseCase(context.appClientRepository),
    update: new UpdateAppClientUseCase(context.appClientRepository),
    delete: new DeleteAppClientUseCase(context.appClientRepository),
  };
}
