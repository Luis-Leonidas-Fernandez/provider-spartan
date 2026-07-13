import { createStandaloneServer } from "../standalone/create-standalone-server.js";

export async function createApp() {
  const app = await createStandaloneServer();
  const module = (app as unknown as { providerGatewayModule?: unknown }).providerGatewayModule;
  if (module !== undefined) {
    app.decorate("container", module);
  }
  return app;
}
