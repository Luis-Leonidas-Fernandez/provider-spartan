import type { FastifyInstance } from "fastify";
import type { ProviderGatewayModule } from "../core/create-provider-gateway-module.js";
import { registerHealthRoutes } from "../features/health/health.routes.js";
import { registerAppClientRoutes } from "../features/app-client/http/app-client.routes.js";
import { registerSubscriptionRoutes } from "../features/subscription/http/subscription.routes.js";
import { registerProviderRoutes } from "../features/provider/http/provider.routes.js";
import { registerCredentialRoutes } from "../features/credential/http/credential.routes.js";
import { registerCodexRoutes } from "../features/codex/http/codex.routes.js";
import { registerGeminiRoutes } from "../features/gemini/http/gemini.routes.js";
import { registerClaudeRoutes } from "../features/claude/http/claude.routes.js";
import { registerCursorRoutes } from "../features/cursor/http/cursor.routes.js";
import { registerGatewayRoutes } from "../features/gateway/http/gateway.routes.js";
import { registerUsageRoutes } from "../features/usage/http/usage.routes.js";
import { providerAuthPlugin } from "../provider-auth/fastify/provider-auth.plugin.js";

export type RegisterProviderGatewayRoutesOptions = {
  providerAuthPublicBaseUrl?: string;
  providerAuthRoutePrefix?: string;
};

export async function registerProviderGatewayRoutes(
  app: FastifyInstance,
  module: ProviderGatewayModule,
  options: RegisterProviderGatewayRoutesOptions = {},
) {
  await registerHealthRoutes(app);
  await app.register(providerAuthPlugin, {
    prefix: "/auth",
    routePrefix: options.providerAuthRoutePrefix ?? "/auth",
    ...(options.providerAuthPublicBaseUrl !== undefined ? { publicBaseUrl: options.providerAuthPublicBaseUrl } : {}),
    module: module.providerAuth,
  });
  await registerAppClientRoutes(app, module);
  await registerSubscriptionRoutes(app, module);
  await registerProviderRoutes(app, module);
  await registerCredentialRoutes(app, module);
  await registerCodexRoutes(app, module);
  await registerGeminiRoutes(app, module);
  await registerClaudeRoutes(app, module);
  await registerCursorRoutes(app, module);
  await registerGatewayRoutes(app, module);
  await registerUsageRoutes(app, module);
}
