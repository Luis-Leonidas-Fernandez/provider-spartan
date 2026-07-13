import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { AppError, ForbiddenError } from "../../../core/errors.js";
import { createRequestAbortSignal, parseOrThrow } from "../../../fastify/http.js";
import {
  claudeAuthFlowInputBodySchema,
  claudeAuthFlowParamsSchema,
  claudeImportTokenBodySchema,
  claudeTestMessageBodySchema,
} from "./claude.schemas.js";

function isLocalHostname(hostname: string | undefined) {
  if (!hostname) return false;
  const value = hostname.split(":")[0]?.toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1" || value === "[::1]";
}

function assertLocalDevRequest(request: { hostname: string; ip: string }) {
  const localIp = request.ip === "127.0.0.1" || request.ip === "::1";
  if (!localIp && !isLocalHostname(request.hostname)) {
    throw new ForbiddenError("Claude local convenience routes are only available on localhost");
  }
}

function sendClaudeLifecycleError(
  error: AppError,
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
) {
  return reply.code(error.statusCode).send({
    error: error.code,
    message: error.message,
    connectUrl: "/claude/connect",
  });
}

function isClaudeLifecycleError(error: unknown) {
  return error instanceof AppError && (
    error.code === "provider_connection_not_connected"
    || error.code === "provider_connection_expired"
    || error.code === "provider_connection_refresh_failed"
    || error.code === "provider_connection_revoked"
    || error.code === "provider_connection_reconnect_required"
  );
}

export async function registerClaudeRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  function writeSseEvent(reply: { raw: NodeJS.WritableStream }, event: unknown) {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  app.get("/claude/connect", async (request) => {
    assertLocalDevRequest(request);
    return container.claude.connect.execute();
  });

  app.get("/claude/status", async (request) => {
    assertLocalDevRequest(request);
    return container.claude.status.execute();
  });

  app.post("/claude/import-token", async (request) => {
    assertLocalDevRequest(request);
    const body = parseOrThrow(claudeImportTokenBodySchema, request.body);
    return container.claude.importToken.execute({
      token: body.token,
      ...(body.name !== undefined ? { name: body.name } : {}),
    });
  });

  app.post("/claude/auth/start", async (request) => {
    assertLocalDevRequest(request);
    return await container.claude.startLocalAuthFlow.execute();
  });

  app.get("/claude/auth/:flowId", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(claudeAuthFlowParamsSchema, request.params);
    return container.claude.getLocalAuthFlow.execute(params.flowId);
  });

  app.get("/claude/auth/:flowId/events", async (request, reply) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(claudeAuthFlowParamsSchema, request.params);
    const snapshot = container.claude.getLocalAuthFlow.execute(params.flowId);

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
    const unsubscribe = container.claude.subscribeLocalAuthFlow.subscribe(params.flowId, (event: unknown) => {
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
        void container.claude.cancelLocalAuthFlow.execute(params.flowId).catch(() => undefined);
      }
      reply.raw.end();
    });
  });

  app.post("/claude/auth/:flowId/input", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(claudeAuthFlowParamsSchema, request.params);
    const body = parseOrThrow(claudeAuthFlowInputBodySchema, request.body);
    return await container.claude.writeLocalAuthFlowInput.execute({
      flowId: params.flowId,
      value: body.value,
    });
  });

  app.post("/claude/auth/:flowId/cancel", async (request) => {
    assertLocalDevRequest(request);
    const params = parseOrThrow(claudeAuthFlowParamsSchema, request.params);
    return await container.claude.cancelLocalAuthFlow.execute(params.flowId);
  });

  app.get("/claude/models", async (request) => {
    assertLocalDevRequest(request);
    return container.claude.listModels.execute();
  });

  app.post("/claude/test-connection", async (request, reply) => {
    assertLocalDevRequest(request);
    try {
      return await container.claude.testConnection.execute();
    } catch (error) {
      if (isClaudeLifecycleError(error)) return sendClaudeLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.post("/claude/test-message", async (request, reply) => {
    assertLocalDevRequest(request);
    const body = parseOrThrow(claudeTestMessageBodySchema, request.body);
    const signal = createRequestAbortSignal(request);
    try {
      return await container.claude.testMessage.execute({
        message: body.message,
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.system !== undefined ? { system: body.system } : {}),
        ...(body.max_tokens !== undefined ? { maxTokens: body.max_tokens } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        signal,
      });
    } catch (error) {
      if (isClaudeLifecycleError(error)) return sendClaudeLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.delete("/claude/disconnect", async (request) => {
    assertLocalDevRequest(request);
    return container.claude.disconnect.execute();
  });
}
