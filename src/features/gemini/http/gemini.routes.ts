import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { AppError, ForbiddenError } from "../../../core/errors.js";
import { createRequestAbortSignal, parseOrThrow } from "../../../fastify/http.js";
import { geminiAuthFlowInputBodySchema, geminiAuthFlowParamsSchema, geminiTestMessageBodySchema } from "./gemini.schemas.js";

function isLocalHostname(hostname: string | undefined) {
  if (!hostname) return false;
  const value = hostname.split(":")[0]?.toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1" || value === "[::1]";
}

function assertLocalDevRequest(request: { hostname: string; ip: string }) {
  const localIp = request.ip === "127.0.0.1" || request.ip === "::1";
  if (!localIp && !isLocalHostname(request.hostname)) {
    throw new ForbiddenError("Gemini local convenience routes are only available on localhost");
  }
}

function sendGeminiNotConnected(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  return reply.code(409).send({
    error: "gemini_not_connected",
    message: "Gemini is not connected",
    connectUrl: "/gemini/connect",
  });
}

function sendGeminiConnectionLifecycleError(
  error: AppError,
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
) {
  return reply.code(error.statusCode).send({
    error: error.code,
    message: error.message,
    connectUrl: "/gemini/connect",
  });
}

function isGeminiConnectionLifecycleError(error: unknown) {
  return error instanceof AppError && (
    error.code === "provider_connection_not_connected"
    || error.code === "provider_connection_expired"
    || error.code === "provider_connection_refresh_failed"
    || error.code === "provider_connection_revoked"
    || error.code === "provider_connection_reconnect_required"
  );
}

export async function registerGeminiRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  function writeSseEvent(reply: { raw: NodeJS.WritableStream }, event: unknown) {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  app.get("/gemini/connect", async (request, reply) => {
    assertLocalDevRequest(request);
    const result = await container.providerAuth.startProviderAuth({
      provider: "gemini",
      callbackMode: "host",
      publicBaseUrl: `${request.protocol}://${request.headers.host}`,
      prefix: "/auth",
    });
    return reply.redirect(result.authorizationUrl);
  });

  app.get("/gemini/status", async (request) => {
    assertLocalDevRequest(request);
    return container.gemini.status.execute();
  });

  app.get("/gemini/capabilities", async (request) => {
    assertLocalDevRequest(request);
    return container.gemini.capabilities.execute();
  });

  app.post("/gemini/auth/start", async (request) => {
    assertLocalDevRequest(request);
    return await container.gemini.startLocalAuthFlow.execute();
  });

  app.get("/gemini/auth/:flowId", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(geminiAuthFlowParamsSchema, request.params);
    return container.gemini.getLocalAuthFlow.execute(params.flowId);
  });

  app.get("/gemini/auth/:flowId/events", async (request, reply) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(geminiAuthFlowParamsSchema, request.params);
    const snapshot = container.gemini.getLocalAuthFlow.execute(params.flowId);

    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.hijack();

    for (const event of snapshot.events) {
      writeSseEvent(reply, event);
    }

    if (snapshot.status !== "running") {
      reply.raw.end();
      return;
    }

    let closedByTerminalEvent = false;
    const unsubscribe = container.gemini.subscribeLocalAuthFlow.subscribe(params.flowId, (event: unknown) => {
      writeSseEvent(reply, event);
      const typed = event as { type?: string };
      if (typed.type === "authenticated" || typed.type === "failed" || typed.type === "cancelled") {
        closedByTerminalEvent = true;
        unsubscribe?.();
        reply.raw.end();
      }
    });

    request.raw.on("close", () => {
      unsubscribe?.();
      if (!closedByTerminalEvent) {
        void container.gemini.cancelLocalAuthFlow.execute(params.flowId).catch(() => undefined);
      }
      reply.raw.end();
    });
  });

  app.post("/gemini/auth/:flowId/input", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(geminiAuthFlowParamsSchema, request.params);
    const body = parseOrThrow(geminiAuthFlowInputBodySchema, request.body);
    return await container.gemini.writeLocalAuthFlowInput.execute({
      flowId: params.flowId,
      value: body.value,
    });
  });

  app.post("/gemini/auth/:flowId/cancel", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(geminiAuthFlowParamsSchema, request.params);
    return await container.gemini.cancelLocalAuthFlow.execute(params.flowId);
  });

  app.get("/gemini/models", async (request, reply) => {
    assertLocalDevRequest(request);
    try {
      return await container.gemini.listModels.execute();
    } catch (error) {
      if (isGeminiConnectionLifecycleError(error)) return sendGeminiConnectionLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.post("/gemini/test-connection", async (request, reply) => {
    assertLocalDevRequest(request);
    try {
      return await container.gemini.testConnection.execute();
    } catch (error) {
      if (isGeminiConnectionLifecycleError(error)) return sendGeminiConnectionLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.post("/gemini/test-message", async (request, reply) => {
    assertLocalDevRequest(request);
    const body = parseOrThrow(geminiTestMessageBodySchema, request.body);
    const signal = createRequestAbortSignal(request);
    try {
      return await container.gemini.testMessage.execute({
        message: body.message,
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.system !== undefined ? { system: body.system } : {}),
        ...(body.max_tokens !== undefined ? { maxTokens: body.max_tokens } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        signal,
      });
    } catch (error) {
      if (isGeminiConnectionLifecycleError(error)) return sendGeminiConnectionLifecycleError(error as AppError, reply);
      if (error instanceof AppError && error.code === "provider_connection_not_connected") return sendGeminiNotConnected(reply);
      throw error;
    }
  });

  app.delete("/gemini/disconnect", async (request) => {
    assertLocalDevRequest(request);
    const result = await container.providerAuth.logoutDefaultProvider({ provider: "gemini" });
    return {
      disconnected: result.loggedOut,
      providerId: result.providerId,
    };
  });
}
