import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { parseOrThrow } from "../../../fastify/http.js";
import { appUsageParamsSchema, providerUsageParamsSchema } from "./usage.schemas.js";

export async function registerUsageRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.get("/usage/overview", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.overview.execute();
  });

  app.get("/usage/providers", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.byProvider.execute();
  });

  app.get("/usage/providers/:providerId", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.byProvider.execute(parseOrThrow(providerUsageParamsSchema, request.params).providerId);
  });

  app.get("/usage/apps", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.byApp.execute();
  });

  app.get("/usage/apps/:appClientId", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.byApp.execute(parseOrThrow(appUsageParamsSchema, request.params).appClientId);
  });

  app.get("/usage/models", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.byModel.execute();
  });

  app.get("/usage/events", async (request) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);
    return container.usage.listEvents.execute();
  });

  app.get("/usage/stream", async (request, reply) => {
    await container.gateway.authenticateRequest.execute(request.headers.authorization);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const unsubscribe = container.usage.eventBus.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
    });

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    request.raw.on("close", () => {
      unsubscribe();
      reply.raw.end();
    });

    return reply.hijack();
  });
}
