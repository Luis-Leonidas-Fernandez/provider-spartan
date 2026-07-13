import Fastify from "fastify";
import { providerGatewayPlugin } from "@local/provider-gateway/fastify";

const app = Fastify({ logger: true });

// Rutas propias de la app host.
app.get("/api/health", async () => ({ ok: true, app: "host-app" }));

// Provider Gateway queda embebido dentro del server de la app host.
await app.register(providerGatewayPlugin, {
  prefix: "/provider-gateway",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "file:./provider_gateway_host_example.db",
  appApiKeyPepper: process.env.APP_API_KEY_PEPPER ?? "dev-only-app-api-key-pepper",
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY ?? "dev-only-credential-encryption-key",
  allowInsecureCredentialStorage: process.env.NODE_ENV !== "production",
  logLevel: "info",
});

await app.listen({ host: "127.0.0.1", port: 3000 });
