import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { createRequestAbortSignal, parseOrThrow } from "../../../fastify/http.js";
import { gatewayChatCompletionSchema, gatewayImageGenerationSchema } from "./gateway.schemas.js";
import { presentGatewayChatCompletion, presentGatewayImageGeneration } from "./gateway.presenter.js";

export async function registerGatewayRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.post("/v1/chat/completions", async (request) => {
    const body = parseOrThrow(gatewayChatCompletionSchema, request.body);
    const clientRequestId = typeof request.headers["x-client-request-id"] === "string" ? request.headers["x-client-request-id"] : undefined;
    const signal = createRequestAbortSignal(request);
    const result = await container.gateway.handleChatCompletion.execute({
      authorizationHeader: request.headers.authorization,
      ...(clientRequestId !== undefined ? { clientRequestId } : {}),
      signal,
      body: {
        model: body.model,
        messages: body.messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.name !== undefined ? { name: message.name } : {}),
        })),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.max_tokens !== undefined ? { max_tokens: body.max_tokens } : {}),
        ...(body.stream !== undefined ? { stream: body.stream } : {}),
      },
    });
    return presentGatewayChatCompletion(result);
  });

  app.post("/v1/images/generations", async (request) => {
    const body = parseOrThrow(gatewayImageGenerationSchema, request.body);
    const clientRequestId = typeof request.headers["x-client-request-id"] === "string" ? request.headers["x-client-request-id"] : undefined;
    const signal = createRequestAbortSignal(request);
    const result = await container.gateway.handleImageGeneration.execute({
      authorizationHeader: request.headers.authorization,
      ...(clientRequestId !== undefined ? { clientRequestId } : {}),
      signal,
      body: {
        model: body.model,
        prompt: body.prompt,
        ...(body.n !== undefined ? { n: body.n } : {}),
        ...(body.size !== undefined ? { size: body.size } : {}),
        ...(body.quality !== undefined ? { quality: body.quality } : {}),
        ...(body.response_format !== undefined ? { response_format: body.response_format } : {}),
      },
    });
    return presentGatewayImageGeneration(result);
  });

}
