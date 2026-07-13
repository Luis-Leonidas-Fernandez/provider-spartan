import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { parseOrThrow, sendCreated } from "../../../fastify/http.js";
import { appSubscriptionBodySchema, appSubscriptionUpdateBodySchema, idParamsSchema, subscriptionPlanBodySchema, subscriptionPlanUpdateBodySchema } from "./subscription.schemas.js";

export async function registerSubscriptionRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.get("/subscription-plans", async () => container.subscription.plan.list.execute());
  app.post("/subscription-plans", async (request, reply) => {
    const body = parseOrThrow(subscriptionPlanBodySchema, request.body);
    return sendCreated(reply, await container.subscription.plan.create.execute({ ...body, isActive: body.isActive ?? true }));
  });
  app.put("/subscription-plans/:id", async (request) => {
    const body = parseOrThrow(subscriptionPlanUpdateBodySchema, request.body);
    return container.subscription.plan.update.execute(parseOrThrow(idParamsSchema, request.params).id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.monthlyRequestLimit !== undefined ? { monthlyRequestLimit: body.monthlyRequestLimit } : {}),
      ...(body.monthlyTokenLimit !== undefined ? { monthlyTokenLimit: body.monthlyTokenLimit } : {}),
      ...(body.monthlyBudgetUsd !== undefined ? { monthlyBudgetUsd: body.monthlyBudgetUsd } : {}),
      ...(body.allowedProvidersJson !== undefined ? { allowedProvidersJson: body.allowedProvidersJson } : {}),
      ...(body.allowedModelsJson !== undefined ? { allowedModelsJson: body.allowedModelsJson } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
  });
  app.delete("/subscription-plans/:id", async (request, reply) => { await container.subscription.plan.delete.execute(parseOrThrow(idParamsSchema, request.params).id); return reply.code(204).send(); });

  app.get("/app-subscriptions", async () => container.subscription.app.list.execute());
  app.post("/app-subscriptions", async (request, reply) => {
    const body = parseOrThrow(appSubscriptionBodySchema, request.body);
    return sendCreated(reply, await container.subscription.app.create.execute({ ...body, endsAt: body.endsAt ?? null }));
  });
  app.put("/app-subscriptions/:id", async (request) => {
    const body = parseOrThrow(appSubscriptionUpdateBodySchema, request.body);
    return container.subscription.app.update.execute(parseOrThrow(idParamsSchema, request.params).id, {
      ...(body.appClientId !== undefined ? { appClientId: body.appClientId } : {}),
      ...(body.planId !== undefined ? { planId: body.planId } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
      ...(body.endsAt !== undefined ? { endsAt: body.endsAt ?? null } : {}),
    });
  });
  app.delete("/app-subscriptions/:id", async (request, reply) => { await container.subscription.app.delete.execute(parseOrThrow(idParamsSchema, request.params).id); return reply.code(204).send(); });
}
