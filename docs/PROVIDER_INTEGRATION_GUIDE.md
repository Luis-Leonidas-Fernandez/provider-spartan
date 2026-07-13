# PROVIDER INTEGRATION GUIDE

Guía corta para integrar `provider-gateway` dentro de otra app.

---

## Cuándo usar cada superficie

| Necesidad | Superficie recomendada |
| --- | --- |
| exponer endpoints HTTP dentro de tu app | `providerGatewayPlugin` |
| montar auth de providers sobre tu servidor | `providerAuthPlugin` |
| usar el runtime sin HTTP | `createProviderGatewayModule()` |
| probar el módulo aislado | standalone |

---

## Embedded en otra app

Ejemplo típico:

```ts
import Fastify from "fastify";
import { providerGatewayPlugin } from "@local/provider-gateway/fastify";

const app = Fastify();

await app.register(providerGatewayPlugin, {
  prefix: "/provider-gateway",
  databaseUrl: process.env.DATABASE_URL,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  appApiKeyPepper: process.env.APP_API_KEY_PEPPER,
});
```

No hace falta levantar otro proceso.

---

## Embedded + auth en la misma app host

Si además querés conexión de cuentas/suscripciones:

```ts
import Fastify from "fastify";
import { createProviderGatewayModule } from "@local/provider-gateway/core";
import { providerGatewayPlugin } from "@local/provider-gateway/fastify";
import { providerAuthPlugin } from "@local/provider-gateway/provider-auth/fastify";

const app = Fastify();
const gateway = createProviderGatewayModule({
  databaseUrl: process.env.DATABASE_URL,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  appApiKeyPepper: process.env.APP_API_KEY_PEPPER,
});

await app.register(providerGatewayPlugin, {
  prefix: "/provider-gateway",
  module: gateway,
});

await app.register(providerAuthPlugin, {
  prefix: "/provider-gateway/auth",
  routePrefix: "/provider-gateway/auth",
  publicBaseUrl: "http://localhost:3000",
  module: gateway.providerAuth,
});
```

---

## Core directo

Si no querés HTTP interno:

```ts
import { createProviderGatewayModule } from "@local/provider-gateway/core";

const gateway = createProviderGatewayModule({
  databaseUrl,
  credentialEncryptionKey,
  appApiKeyPepper,
});
```

---

## Standalone opcional

Se mantiene para dev/testing:

```bash
npm run dev:standalone
```

---

## Compatibilidad de providers

- `OpenAICompatibleAdapter` implementado
- `MiniMaxAdapter` y `KimiAdapter` actúan como wrappers del contrato OpenAI-compatible
- si el provider no devuelve usage, el sistema estima tokens y marca `usageSource=estimated`
- para auth embebible real, hoy están cubiertos **Codex y Gemini**
- para runtime local + gateway, hoy están cubiertos **Codex, Gemini y Claude**

---

## Matriz corta de integración

| Provider | Embebible por `providerAuthPlugin` | Facade local | Gateway |
| --- | --- | --- | --- |
| Codex | Sí | Sí | Sí |
| Gemini | Sí | Sí | Sí |
| Claude | No todavía | Sí | Sí |

---

## Ver también

- `docs/PROVIDER_AUTH_EMBEDDING_GUIDE.md`
- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE.md`
