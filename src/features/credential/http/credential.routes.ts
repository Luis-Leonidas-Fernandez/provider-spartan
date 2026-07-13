import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { parseOrThrow } from "../../../fastify/http.js";
import { buildCodexOauthMetadata } from "../application/services/build-codex-oauth-metadata.js";
import { credentialParamsSchema, oauthCallbackQuerySchema, storeApiKeyBodySchema, storeOauthTokenBodySchema, storeTokenBodySchema } from "./credential.schemas.js";
import { presentProviderCredential } from "./credential.presenter.js";

export async function registerCredentialRoutes(app: FastifyInstance, container: ProviderGatewayModule) {
  app.get("/auth/callback", async (request) => {
    const query = parseOrThrow(oauthCallbackQuerySchema, request.query);
    const completed = await container.providerAuth.completeProviderAuth({
      provider: "codex",
      state: query.state,
      code: query.code,
    });
    return completed.legacyCredential
      ? presentProviderCredential(completed.legacyCredential)
      : {
        connected: true,
        providerId: completed.connection.providerId,
        connectionId: completed.connection.id,
        status: completed.connection.status,
      };
  });
  app.get("/providers/:providerId/auth/status", async (request) => presentProviderCredential(await container.credential.getStatus.execute(parseOrThrow(credentialParamsSchema, request.params).providerId)));
  app.post("/providers/:providerId/auth/api-key", async (request) => {
    const params = parseOrThrow(credentialParamsSchema, request.params);
    const body = parseOrThrow(storeApiKeyBodySchema, request.body);
    const credential = await container.credential.store.execute({
      providerId: params.providerId,
      credentialType: "api_key",
      secret: body.apiKey,
      ...(body.tokenExpiresAt !== undefined ? { tokenExpiresAt: body.tokenExpiresAt } : {}),
    });
    return presentProviderCredential(credential);
  });
  app.post("/providers/:providerId/auth/token", async (request) => {
    const params = parseOrThrow(credentialParamsSchema, request.params);
    const body = parseOrThrow(storeTokenBodySchema, request.body);
    const credential = await container.credential.store.execute({
      providerId: params.providerId,
      credentialType: "bearer_token",
      secret: body.token,
      ...(body.providerMetadata ? { metadataJson: JSON.stringify(body.providerMetadata) } : {}),
      ...(body.tokenExpiresAt !== undefined ? { tokenExpiresAt: body.tokenExpiresAt } : {}),
      ...(body.refreshTokenExists !== undefined ? { refreshTokenExists: body.refreshTokenExists } : {}),
    });
    return presentProviderCredential(credential);
  });
  app.post("/providers/:providerId/auth/oauth-token", async (request) => {
    const params = parseOrThrow(credentialParamsSchema, request.params);
    const body = parseOrThrow(storeOauthTokenBodySchema, request.body);
    const credential = await container.credential.store.execute({
      providerId: params.providerId,
      credentialType: "oauth_token",
      secret: body.accessToken,
      ...(body.refreshToken ? { refreshToken: body.refreshToken } : {}),
      ...(body.idToken ? { idToken: body.idToken } : {}),
      metadataJson: JSON.stringify(buildCodexOauthMetadata(body)),
      ...(body.tokenExpiresAt !== undefined ? { tokenExpiresAt: body.tokenExpiresAt } : {}),
      ...(body.refreshTokenExists !== undefined ? { refreshTokenExists: body.refreshTokenExists || Boolean(body.refreshToken) } : {}),
    });
    return presentProviderCredential(credential);
  });
  app.get("/providers/:providerId/oauth/start", async (request) => {
    const params = parseOrThrow(credentialParamsSchema, request.params);
    return container.credential.startOauth.execute(params.providerId);
  });
  app.get("/providers/:providerId/oauth/callback", async (request) => {
    const params = parseOrThrow(credentialParamsSchema, request.params);
    const query = parseOrThrow(oauthCallbackQuerySchema, request.query);
    return presentProviderCredential(await container.credential.completeOauth.execute({
      providerId: params.providerId,
      state: query.state,
      code: query.code,
    }));
  });
  app.post("/providers/:providerId/oauth/refresh", async (request) => {
    const params = parseOrThrow(credentialParamsSchema, request.params);
    return presentProviderCredential(await container.credential.refreshOauth.execute(params.providerId));
  });
  app.delete("/providers/:providerId/auth", async (request, reply) => { await container.credential.delete.execute(parseOrThrow(credentialParamsSchema, request.params).providerId); return reply.code(204).send(); });
}
