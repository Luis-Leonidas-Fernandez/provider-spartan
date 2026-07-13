import type { FastifyInstance } from "fastify";
import { parseOrThrow, sendCreated } from "../../../fastify/http.js";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { appClientParamsSchema, createAppClientBodySchema, updateAppClientBodySchema } from "./app-client.schemas.js";
import { presentAppClient } from "./app-client.presenter.js";

export async function registerAppClientRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.get("/app-clients", async () => {
    const result = await container.appClient.list.execute();
    return result.map(presentAppClient);
  });

  app.post("/app-clients", async (request, reply) => {
    const body = parseOrThrow(createAppClientBodySchema, request.body);
    const created = await container.appClient.create.execute({
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    return sendCreated(reply, {
      appClient: presentAppClient(created.entity),
      apiKey: created.apiKey,
    });
  });

  app.put("/app-clients/:id", async (request) => {
    const params = parseOrThrow(appClientParamsSchema, request.params);
    const body = parseOrThrow(updateAppClientBodySchema, request.body);
    const updated = await container.appClient.update.execute({
      id: params.id,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
    return presentAppClient(updated);
  });

  app.delete("/app-clients/:id", async (request, reply) => {
    const params = parseOrThrow(appClientParamsSchema, request.params);
    await container.appClient.delete.execute(params.id);
    return reply.code(204).send();
  });

  app.post("/app-clients/:id/rotate-key", async (request) => {
    const params = parseOrThrow(appClientParamsSchema, request.params);
    const apiKey = await container.appClient.rotateKey.execute(params.id);
    return { apiKey };
  });
}
