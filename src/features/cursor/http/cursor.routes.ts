import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { AppError, ForbiddenError } from "../../../core/errors.js";
import { createRequestAbortSignal, parseOrThrow } from "../../../fastify/http.js";
import { cursorAuthFlowInputBodySchema, cursorAuthFlowParamsSchema, cursorTestMessageBodySchema } from "./cursor.schemas.js";

function isLocalHostname(hostname: string | undefined) {
  if (!hostname) return false;
  const value = hostname.split(":")[0]?.toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1" || value === "[::1]";
}

function assertLocalDevRequest(request: { hostname: string; ip: string }) {
  const localIp = request.ip === "127.0.0.1" || request.ip === "::1";
  if (!localIp && !isLocalHostname(request.hostname)) {
    throw new ForbiddenError("Cursor local convenience routes are only available on localhost");
  }
}

export async function registerCursorRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  function sendCursorLifecycleError(
    error: AppError,
    reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
  ) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      connectUrl: "/cursor/connect",
    });
  }

  function isCursorLifecycleError(error: unknown) {
    return error instanceof AppError && (
      error.code === "cursor_cli_not_installed"
      || error.code === "cursor_auth_required"
      || error.code === "cursor_models_unavailable"
      || error.code === "cursor_model_listing_not_supported"
    );
  }

  function writeSseEvent(reply: { raw: NodeJS.WritableStream }, event: unknown) {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  app.get("/cursor/connect", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.connect.execute();
  });

  app.get("/cursor/status", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.status.execute();
  });

  app.get("/cursor/capabilities", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.capabilities.execute();
  });

  app.get("/cursor/models", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.listModels.execute();
  });

  app.post("/cursor/test-connection", async (request, reply) => {
    assertLocalDevRequest(request);
    try {
      return await container.cursor.testConnection.execute();
    } catch (error) {
      if (isCursorLifecycleError(error)) return sendCursorLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.post("/cursor/test-message", async (request, reply) => {
    assertLocalDevRequest(request);
    const body = parseOrThrow(cursorTestMessageBodySchema, request.body);
    const signal = createRequestAbortSignal(request);
    try {
      return await container.cursor.testMessage.execute({
        message: body.message,
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.system !== undefined ? { system: body.system } : {}),
        ...(body.max_tokens !== undefined ? { maxTokens: body.max_tokens } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        signal,
      });
    } catch (error) {
      if (isCursorLifecycleError(error)) return sendCursorLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.post("/cursor/auth/start", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.startLocalAuthFlow.execute();
  });

  app.get("/cursor/auth/:flowId", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(cursorAuthFlowParamsSchema, request.params);
    return container.cursor.getLocalAuthFlow.execute(params.flowId);
  });

  app.get("/cursor/auth/:flowId/events", async (request, reply) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(cursorAuthFlowParamsSchema, request.params);
    const snapshot = container.cursor.getLocalAuthFlow.execute(params.flowId);

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
    const unsubscribe = container.cursor.subscribeLocalAuthFlow.subscribe(params.flowId, (event: unknown) => {
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
        void container.cursor.cancelLocalAuthFlow.execute(params.flowId).catch(() => undefined);
      }
      reply.raw.end();
    });
  });

  app.post("/cursor/auth/:flowId/input", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(cursorAuthFlowParamsSchema, request.params);
    const body = parseOrThrow(cursorAuthFlowInputBodySchema, request.body);
    return await container.cursor.writeLocalAuthFlowInput.execute({
      flowId: params.flowId,
      value: body.value,
    });
  });

  app.post("/cursor/auth/:flowId/cancel", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(cursorAuthFlowParamsSchema, request.params);
    return await container.cursor.cancelLocalAuthFlow.execute(params.flowId);
  });

  app.post("/cursor/auth/logout", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.disconnect.execute();
  });

  app.delete("/cursor/disconnect", async (request) => {
    assertLocalDevRequest(request);
    return await container.cursor.disconnect.execute();
  });
}
