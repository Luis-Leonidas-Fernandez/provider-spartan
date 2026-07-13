import Fastify from "fastify";
import { createStandaloneServer } from "./create-standalone-server.js";
import { getConfig } from "../core/config.js";
import { providerGatewayPlugin } from "../fastify/provider-gateway.plugin.js";
import type { ProviderGatewayModule } from "../core/create-provider-gateway-module.js";

const CODEX_CALLBACK_HOST = "127.0.0.1";
const CODEX_CALLBACK_PORT = 1455;

function getProviderGatewayModule(app: Awaited<ReturnType<typeof createStandaloneServer>>) {
  return (app as unknown as { providerGatewayModule: ProviderGatewayModule }).providerGatewayModule;
}

async function createCodexCallbackServer(module: ProviderGatewayModule) {
  const callbackApp = Fastify({ logger: false });
  await callbackApp.register(providerGatewayPlugin, { module });
  await callbackApp.listen({ host: CODEX_CALLBACK_HOST, port: CODEX_CALLBACK_PORT });
  return callbackApp;
}

export async function startStandaloneServer() {
  const app = await createStandaloneServer();
  const config = getConfig();
  const codexCallbackApp = await createCodexCallbackServer(getProviderGatewayModule(app));
  app.addHook("onClose", async () => {
    await codexCallbackApp.close();
  });
  await app.listen({ host: config.gatewayHost, port: config.gatewayPort });
  return app;
}

startStandaloneServer().catch((error) => {
  console.error("Failed to start provider-gateway", error);
  process.exit(1);
});
