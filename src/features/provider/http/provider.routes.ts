import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { parseOrThrow, sendCreated } from "../../../fastify/http.js";
import { providerBodySchema, providerParamsSchema, providerUpdateBodySchema } from "./provider.schemas.js";

export async function registerProviderRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.get("/providers", async () => container.provider.list.execute());
  app.get("/providers/:id", async (request) => container.provider.get.execute(parseOrThrow(providerParamsSchema, request.params).id));
  app.post("/providers", async (request, reply) => {
    const body = parseOrThrow(providerBodySchema, request.body);
    return sendCreated(reply, await container.provider.create.execute({
      name: body.name,
      providerType: body.providerType,
      accessMode: body.accessMode,
      baseUrl: body.baseUrl ?? null,
      defaultModel: body.defaultModel ?? null,
      isEnabled: body.isEnabled ?? true,
      isDefault: body.isDefault ?? false,
      supportsUsageReporting: body.supportsUsageReporting ?? false,
      supportsStreaming: body.supportsStreaming ?? false,
      pricingJson: body.pricing ? JSON.stringify(body.pricing) : null,
      notes: body.notes ?? null,
    }));
  });
  app.put("/providers/:id", async (request) => {
    const body = parseOrThrow(providerUpdateBodySchema, request.body);
    return container.provider.update.execute(parseOrThrow(providerParamsSchema, request.params).id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.providerType !== undefined ? { providerType: body.providerType } : {}),
      ...(body.accessMode !== undefined ? { accessMode: body.accessMode } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl ?? null } : {}),
      ...(body.defaultModel !== undefined ? { defaultModel: body.defaultModel ?? null } : {}),
      ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      ...(body.supportsUsageReporting !== undefined ? { supportsUsageReporting: body.supportsUsageReporting } : {}),
      ...(body.supportsStreaming !== undefined ? { supportsStreaming: body.supportsStreaming } : {}),
      ...(body.pricing !== undefined ? { pricingJson: body.pricing ? JSON.stringify(body.pricing) : null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
    });
  });
  app.delete("/providers/:id", async (request, reply) => { await container.provider.delete.execute(parseOrThrow(providerParamsSchema, request.params).id); return reply.code(204).send(); });
  app.post("/providers/:id/set-default", async (request) => container.provider.setDefault.execute(parseOrThrow(providerParamsSchema, request.params).id));
  app.get("/providers/:id/health", async (request) => container.provider.getHealth.execute(parseOrThrow(providerParamsSchema, request.params).id));
  app.post("/providers/:id/test-connection", async (request) => container.provider.testConnection.execute(parseOrThrow(providerParamsSchema, request.params).id));
}
