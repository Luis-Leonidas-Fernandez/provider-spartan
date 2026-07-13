import type { FastifyInstance } from "fastify";
import { AppError } from "../../core/errors.js";
import { parseOrThrow } from "../../fastify/http.js";
import type { ProviderAuthModule } from "../core/provider-auth.module.js";
import { getConnectionStatusMessage, getConnectionStatusReason, shouldReconnectForStatus } from "../core/provider-auth.utils.js";
import { providerAuthCallbackQuerySchema, providerAuthParamsSchema, providerAuthStatusQuerySchema } from "./provider-auth.schemas.js";

function presentProviderConnection(connection: Awaited<ReturnType<ProviderAuthModule["getProviderAuthStatus"]>> | null) {
  if (!connection) {
    return {
      connected: false,
      reconnectRequired: true,
      message: "Provider is not connected",
      reason: "not_connected",
      connection: null,
    };
  }
  return {
    connected: connection.status === "connected",
    reconnectRequired: shouldReconnectForStatus(connection.status),
    message: getConnectionStatusMessage(connection.status),
    reason: getConnectionStatusReason(connection.status),
    connection: {
      id: connection.id,
      providerId: connection.providerId,
      providerType: connection.providerType,
      authType: connection.authType,
      name: connection.name,
      status: connection.status,
      isDefault: connection.isDefault,
      scopesJson: connection.scopesJson,
      metadataJson: connection.metadataJson,
      tokenExpiresAt: connection.tokenExpiresAt,
      lastRefreshAt: connection.lastRefreshAt,
      lastAuthCheckAt: connection.lastAuthCheckAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    },
  };
}

export async function registerProviderAuthRoutes(
  app: FastifyInstance,
  module: ProviderAuthModule,
  options?: { publicBaseUrl?: string; routePrefix?: string; blockedProviders?: Record<string, string> },
) {
  function assertProviderAllowed(provider: string) {
    const reason = options?.blockedProviders?.[provider];
    if (reason) throw new AppError(reason, 410, "provider_auth_blocked");
  }

  app.get("/:provider/start", async (request) => {
    const params = parseOrThrow(providerAuthParamsSchema, request.params);
    assertProviderAllowed(params.provider);
    return module.startProviderAuth({
      provider: params.provider,
      callbackMode: "host",
      publicBaseUrl: options?.publicBaseUrl ?? `${request.protocol}://${request.headers.host}`,
      prefix: options?.routePrefix ?? "/auth",
    });
  });

  app.get("/:provider/callback", async (request) => {
    const params = parseOrThrow(providerAuthParamsSchema, request.params);
    assertProviderAllowed(params.provider);
    const query = parseOrThrow(providerAuthCallbackQuerySchema, request.query);
    const completed = await module.completeProviderAuth({
      provider: params.provider,
      state: query.state,
      code: query.code,
    });
    return presentProviderConnection(completed.connection);
  });

  app.get("/:provider/status", async (request) => {
    const params = parseOrThrow(providerAuthParamsSchema, request.params);
    assertProviderAllowed(params.provider);
    const query = parseOrThrow(providerAuthStatusQuerySchema, request.query);
    const connection = await module.getDefaultProviderAuthStatus({
      provider: params.provider,
      ...(query.providerId ? { providerId: query.providerId } : {}),
    });
    return presentProviderConnection(connection);
  });

  app.post("/:provider/logout", async (request) => {
    const params = parseOrThrow(providerAuthParamsSchema, request.params);
    assertProviderAllowed(params.provider);
    const query = parseOrThrow(providerAuthStatusQuerySchema, request.query);
    return module.logoutDefaultProvider({
      provider: params.provider,
      ...(query.providerId ? { providerId: query.providerId } : {}),
    });
  });
}
