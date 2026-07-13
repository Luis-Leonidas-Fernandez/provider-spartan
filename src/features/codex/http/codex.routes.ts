import type { FastifyInstance } from "fastify";
import { AppError } from "../../../core/errors.js";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { parseOrThrow } from "../../../fastify/http.js";
import { CodexLocalOnlyError, CodexNotConnectedError } from "../domain/codex.errors.js";
import { codexTestMessageBodySchema } from "./codex.schemas.js";

function isLocalHostname(hostname: string | undefined) {
  if (!hostname) return false;
  const value = hostname.split(":")[0]?.toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1" || value === "[::1]";
}

function assertLocalDevRequest(request: { hostname: string; ip: string }) {
  const localIp = request.ip === "127.0.0.1" || request.ip === "::1";
  if (!localIp && !isLocalHostname(request.hostname)) throw new CodexLocalOnlyError();
}

function sendCodexNotConnected(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  return reply.code(409).send({
    error: "codex_not_connected",
    message: "Codex is not connected",
    connectUrl: "/codex/connect",
  });
}

function sendCodexConnectionLifecycleError(
  error: AppError,
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
) {
  return reply.code(error.statusCode).send({
    error: error.code,
    message: error.message,
    connectUrl: "/codex/connect",
  });
}

function isCodexConnectionLifecycleError(error: unknown) {
  return error instanceof AppError && (
    error.code === "provider_connection_not_connected"
    || error.code === "provider_connection_expired"
    || error.code === "provider_connection_refresh_failed"
    || error.code === "provider_connection_revoked"
    || error.code === "provider_connection_reconnect_required"
  );
}

export async function registerCodexRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.get("/codex/connect", async (request, reply) => {
    assertLocalDevRequest(request);
    const result = await container.providerAuth.startProviderAuth({
      provider: "codex",
      callbackMode: "local-cli",
    });
    return reply.redirect(result.authorizationUrl);
  });

  app.delete("/codex/disconnect", async (request) => {
    assertLocalDevRequest(request);
    const result = await container.providerAuth.logoutDefaultProvider({ provider: "codex" });
    return {
      disconnected: result.loggedOut,
      providerId: result.providerId,
    };
  });

  app.get("/codex/status", async (request) => {
    assertLocalDevRequest(request);
    return container.codex.status.execute();
  });

  app.get("/codex/models", async (request) => {
    assertLocalDevRequest(request);
    return container.codex.listModels.execute();
  });

  app.post("/codex/test-connection", async (request, reply) => {
    assertLocalDevRequest(request);
    try {
      return await container.codex.testConnection.execute();
    } catch (error) {
      if (error instanceof CodexNotConnectedError) return sendCodexNotConnected(reply);
      if (isCodexConnectionLifecycleError(error)) return sendCodexConnectionLifecycleError(error as AppError, reply);
      throw error;
    }
  });

  app.post("/codex/test-message", async (request, reply) => {
    assertLocalDevRequest(request);
    const body = parseOrThrow(codexTestMessageBodySchema, request.body);
    try {
      return await container.codex.testMessage.execute({
        message: body.message,
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.system !== undefined ? { system: body.system } : {}),
        ...(body.max_tokens !== undefined ? { maxTokens: body.max_tokens } : {}),
      });
    } catch (error) {
      if (error instanceof CodexNotConnectedError) return sendCodexNotConnected(reply);
      if (isCodexConnectionLifecycleError(error)) return sendCodexConnectionLifecycleError(error as AppError, reply);
      throw error;
    }
  });
}
