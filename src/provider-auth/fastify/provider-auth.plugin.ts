import type { FastifyPluginAsync } from "fastify";
import type { ProviderAuthModule } from "../core/provider-auth.module.js";
import { registerProviderAuthRoutes } from "./provider-auth.routes.js";

export type ProviderAuthPluginOptions = {
  module: ProviderAuthModule;
  publicBaseUrl?: string;
  routePrefix?: string;
  blockedProviders?: Record<string, string>;
};

export const providerAuthPlugin: FastifyPluginAsync<ProviderAuthPluginOptions> = async (app, options) => {
  await registerProviderAuthRoutes(app, options.module, {
    ...(options.publicBaseUrl !== undefined ? { publicBaseUrl: options.publicBaseUrl } : {}),
    ...(options.routePrefix !== undefined ? { routePrefix: options.routePrefix } : {}),
    ...(options.blockedProviders !== undefined ? { blockedProviders: options.blockedProviders } : {}),
  });
};
