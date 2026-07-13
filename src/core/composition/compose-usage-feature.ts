import { GetUsageByAppUseCase } from "../../features/usage/application/use-cases/get-usage-by-app.use-case.js";
import { GetUsageByModelUseCase } from "../../features/usage/application/use-cases/get-usage-by-model.use-case.js";
import { GetUsageByProviderUseCase } from "../../features/usage/application/use-cases/get-usage-by-provider.use-case.js";
import { GetUsageOverviewUseCase } from "../../features/usage/application/use-cases/get-usage-overview.use-case.js";
import { ListUsageEventsUseCase } from "../../features/usage/application/use-cases/list-usage-events.use-case.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeUsageFeature(context: CompositionContext) {
  return {
    overview: new GetUsageOverviewUseCase(
      context.usageEventRepository,
      context.providerRepository,
      context.appClientRepository,
    ),
    byProvider: new GetUsageByProviderUseCase(context.usageEventRepository, context.providerRepository),
    byApp: new GetUsageByAppUseCase(context.usageEventRepository, context.appClientRepository),
    byModel: new GetUsageByModelUseCase(context.usageEventRepository),
    listEvents: new ListUsageEventsUseCase(context.usageEventRepository),
    eventBus: context.eventBus,
  };
}
