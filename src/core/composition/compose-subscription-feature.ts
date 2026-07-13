import { CreateAppSubscriptionUseCase, CreateSubscriptionPlanUseCase, DeleteAppSubscriptionUseCase, DeleteSubscriptionPlanUseCase, ListAppSubscriptionsUseCase, ListSubscriptionPlansUseCase, UpdateAppSubscriptionUseCase, UpdateSubscriptionPlanUseCase } from "../../features/subscription/application/use-cases/manage-subscription-plans.use-cases.js";
import type { CompositionContext } from "./create-composition-context.js";

export function composeSubscriptionFeature(context: CompositionContext) {
  return {
    plan: {
      create: new CreateSubscriptionPlanUseCase(context.subscriptionPlanRepository),
      list: new ListSubscriptionPlansUseCase(context.subscriptionPlanRepository),
      update: new UpdateSubscriptionPlanUseCase(context.subscriptionPlanRepository),
      delete: new DeleteSubscriptionPlanUseCase(context.subscriptionPlanRepository),
    },
    app: {
      create: new CreateAppSubscriptionUseCase(context.appSubscriptionRepository),
      list: new ListAppSubscriptionsUseCase(context.appSubscriptionRepository),
      update: new UpdateAppSubscriptionUseCase(context.appSubscriptionRepository),
      delete: new DeleteAppSubscriptionUseCase(context.appSubscriptionRepository),
    },
  };
}
