# PROVIDER AUTH EMBEDDING GUIDE

`provider-auth` es el módulo que administra **conexiones vivas de cuentas/suscripciones** dentro de `provider-gateway`.

No está pensado como API-key manager.

Estado actual:

- soporta `codex`
- soporta `gemini`
- **no** soporta todavía `claude` como provider embebible genérico

---

## Qué resuelve

Usalo cuando tu app host necesita:

- iniciar autenticación contra un provider
- recibir el callback usando **su propio servidor**
- persistir la conexión
- refrescar tokens cuando corresponde
- exponer estado operativo de la conexión
- desconectar una cuenta sin tocar lógica interna del gateway

---

## Qué vive en `provider-auth` y qué sigue en `credential`

| Área | Dueño |
| --- | --- |
| OAuth / callback / refresh | `provider-auth` |
| lifecycle de conexión | `provider-auth` |
| tabla `provider_connections` | `provider-auth` |
| API keys manuales / credenciales genéricas | `credential` |
| compat legacy con `provider_credentials` | temporal / bridge |

Regla práctica:

- si hablás de **connection lifecycle**, pensá en `provider-auth`
- si hablás de **API keys o secretos genéricos**, pensá en `credential`

---


## Camino recomendado: montar todo el gateway en el server host

Para una app cliente real, preferí montar `providerGatewayPlugin`. Así quedan juntos:

- rutas humanas/locales de providers
- rutas embebibles `/auth/:provider/*`
- gateway `/v1/chat/completions`
- usage y request logs

```ts
import Fastify from "fastify";
import { providerGatewayPlugin } from "@local/provider-gateway/fastify";

const app = Fastify();

await app.register(providerGatewayPlugin, {
  prefix: "/provider-gateway",
  publicBaseUrl: "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  appApiKeyPepper: process.env.APP_API_KEY_PEPPER,
  allowInsecureCredentialStorage: false,
});
```

Con ese montaje, la callback Codex host-mode queda en:

```txt
http://localhost:3000/provider-gateway/auth/codex/callback
```

`standalone` usa el mismo plugin, pero es solo una comodidad de desarrollo.

## Montaje avanzado: solo provider-auth

La app host pone el servidor. Si necesitás solamente auth/lifecycle sin montar todo el gateway, podés usar `providerAuthPlugin` directamente.

```ts
import Fastify from "fastify";
import { createProviderGatewayModule } from "@local/provider-gateway/core";
import { providerAuthPlugin } from "@local/provider-gateway/provider-auth/fastify";

const app = Fastify();
const gateway = createProviderGatewayModule({
  databaseUrl: process.env.DATABASE_URL,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  appApiKeyPepper: process.env.APP_API_KEY_PEPPER,
  allowInsecureCredentialStorage: false,
  providerAuthRefreshSkewMs: 5 * 60 * 1000,
});

await app.register(providerAuthPlugin, {
  prefix: "/provider-gateway/auth",
  routePrefix: "/provider-gateway/auth",
  publicBaseUrl: "http://localhost:3000",
  module: gateway.providerAuth,
});
```

---

## Cómo se relacionan `prefix`, `routePrefix` y `publicBaseUrl`

| Opción | Qué hace |
| --- | --- |
| `prefix` | dónde quedan montadas las rutas en Fastify |
| `routePrefix` | segmento usado para construir la callback host-mode |
| `publicBaseUrl` | base pública final sobre la que se arma la callback |

Ejemplo:

- `prefix = /provider-gateway/auth`
- `routePrefix = /provider-gateway/auth`
- `publicBaseUrl = http://localhost:3000`

Entonces la callback esperada queda:

- `http://localhost:3000/provider-gateway/auth/codex/callback`

En la práctica, `prefix` y `routePrefix` suelen coincidir, pero conceptualmente no son lo mismo.

---

## Happy path host-mode

1. La app host monta `providerAuthPlugin`
2. El usuario entra a `GET /provider-gateway/auth/codex/start`
3. Codex redirige a `GET /provider-gateway/auth/codex/callback`
4. `GET /provider-gateway/auth/codex/status` devuelve `connected: true`
5. `POST /provider-gateway/auth/codex/logout` limpia la conexión
6. `GET /provider-gateway/auth/codex/status` vuelve a `connected: false`

---

## Host-mode vs standalone / local-cli

| Modo | Cuándo usarlo | Callback |
| --- | --- | --- |
| **host** | app cliente real embebiendo el módulo | callback sobre el servidor host |
| **local-cli** | desarrollo manual / conveniencia local | callback local estilo CLI |

Regla recomendada:

- para integración real: **host-mode**
- para probar localmente el módulo aislado: **local-cli / standalone**

Para Gemini, esta distinción es especialmente importante:

- 9router evidencia un modo **`local_loopback`**
- no evidencia todavía un modo **`hosted_web`** embebible

Referencia:

- `docs/GEMINI_AUTH_RESEARCH.md`

---

## Lifecycle de conexión

Estados persistidos o presentados por `provider-auth`:

| Estado | Significado |
| --- | --- |
| `pending` | se inició auth pero todavía no se completó |
| `connected` | la conexión está usable |
| `expired` | hubo conexión válida pero venció y no se pudo refrescar |
| `refresh_failed` | hubo conexión, se intentó refresh y falló |
| `revoked` | el provider invalidó la conexión o el refresh quedó irrecuperable |
| `disabled` | la conexión fue deshabilitada |
| `error` | quedó un estado operativo de error no clasificado |
| `not_connected` | estado presentado cuando no existe conexión usable |

Campos comunes de status:

| Campo | Significado |
| --- | --- |
| `connected` | indica si la conexión está lista para usar |
| `reconnectRequired` | indica si la app debería pedir reconexión |
| `reason` | motivo normalizado (`not_connected`, `expired`, `refresh_failed`, `revoked`, `disabled`, `error`, `null`) |
| `message` | mensaje operativo listo para UI o debugging |

---

## Refresh policy

`provider-auth` decide el refresh; las facades como `/codex/*` no recalculan lifecycle.

Opción pública relevante:

- `providerAuthRefreshSkewMs`

Default actual:

- `5 * 60 * 1000` (5 minutos)

Esto significa que, si el token está por vencer dentro de esa ventana y existe refresh token, el módulo puede intentar renovarlo antes de usarlo.

---

## Auditoría liviana de lifecycle

El lifecycle puede escribir auditoría sanitizada en disco.

Eventos mínimos actuales:

- `connection_started`
- `connection_completed`
- `connection_refreshed`
- `connection_expired`
- `connection_refresh_failed`
- `connection_logged_out`
- `connection_revoked`

Qué sí guarda:

- provider
- providerId
- connectionId
- previousStatus
- nextStatus
- occurredAt
- error sanitizado

Qué **no** guarda:

- access tokens
- refresh tokens
- id tokens
- prompts
- respuestas completas
- payloads grandes

---

## Contrato actual de `ProviderAuthStrategy`

El contrato actual ya está orientado a conexiones:

- `start` = iniciar auth
- `exchangeCode` = completar auth OAuth authorization_code
- `refreshToken` = refrescar la conexión
- `buildConnectionMetadata` = normalizar metadata reusable
- `getDefaultProviderSeed` = auto-crear provider si corresponde
- `matchesProviderRecord` = validar compatibilidad del provider real

No se renombra todavía para evitar churn innecesario.

---

## Cómo agregar un provider nuevo

Para agregar otro provider:

1. crear una strategy concreta en `provider-auth/providers/<provider>`
2. implementar `ProviderAuthStrategy`
3. registrarla en la composition root
4. evitar tocar `provider-auth/core`

Si necesitás tocar `provider-auth/core`, probablemente el contrato todavía no está bien resuelto.

---

## Simetría real vs simetría deseable

Hoy conviene distinguir:

- **simetría de lifecycle embebible** → Codex + Gemini
- **simetría de runtime local/gateway** → Codex + Gemini + Claude

Claude ya participa del gateway y de la experiencia local, pero todavía no entra por `providerAuthPlugin`.

Eso significa:

- si tu app host necesita auth embebible genérica hoy, contá con **Codex y Gemini**
- si necesitás Claude hoy, usá la facade local `/claude/*`

---

## Ver también

- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE.md`
- `docs/SOFTWARE_DESIGN_GUIDE.md`
