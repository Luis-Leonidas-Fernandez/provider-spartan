<p align="center">
  <img src="./asset/spartan_log.png" alt="Provider Spartan" width="360">
</p>

<p align="center">
  <strong>Provider Spartan</strong><br />
  Reusable provider gateway for AI subscriptions, local CLI runtimes and OpenAI-compatible apps.
</p>

# provider-gateway

> Capa reusable para conectar apps con múltiples providers de IA, exponer un gateway OpenAI-compatible y montar autenticación de suscripciones/cuentas sin levantar un servidor aparte.

---

## Quick Index

- [Qué resuelve](#qué-resuelve)
- [Capacidades actuales](#capacidades-actuales)
- [Modos de uso](#modos-de-uso)
- [Quick start](#quick-start)
- [Provider auth embebible](#provider-auth-embebible)
- [Rutas y contratos](#rutas-y-contratos)
- [Arquitectura](#arquitectura)
- [Scripts](#scripts)
- [Versionado](#versionado)
- [Limitaciones actuales](#limitaciones-actuales)
- [Guías disponibles](#guías-disponibles)
- [Estado de Gemini](#estado-de-gemini)

---

## Qué resuelve

`provider-gateway` sirve para tres cosas principales:

1. **embebelo en otra app** sin correr un segundo backend
2. **exponer un gateway reusable** para requests tipo OpenAI
3. **gestionar conexiones de cuentas/suscripciones** vía `provider-auth`

La idea central es separar:

- **runtime/gateway**
- **autenticación de providers**
- **credenciales legacy / API keys**
- **observabilidad y usage**

---

## Capacidades actuales

| Capacidad | Qué hace hoy |
| --- | --- |
| Gateway OpenAI-compatible | Expone `POST /v1/chat/completions` |
| Modo embebible | Se monta como plugin Fastify dentro de otra app |
| Core reusable | Se puede usar sin HTTP vía `createProviderGatewayModule()` |
| Provider auth embebible | Monta OAuth y lifecycle de conexiones sobre el servidor host para Codex y Gemini |
| Codex convenience facade | Expone `/codex/*` para dev/local y pruebas humanas |
| Gemini convenience facade | Expone `/gemini/*` para Google OAuth + runtime local Antigravity |
| Claude convenience facade | Expone `/claude/*` para login local, import token y runtime CLI |
| Cursor local facade | Expone `/cursor/*` para detección, status, auth flow local, test-connection y test-message |
| Usage y request logs | Registra métricas, auditoría sanitizada y stream de usage |
| Adapters actuales | Base OpenAI-compatible + wrappers MiniMax y Kimi |

---

## Simetría actual entre providers

| Provider | Connect/status | Models | Test connection | Test message | Gateway `/v1/chat/completions` | Runtime principal |
| --- | --- | --- | --- | --- | --- | --- |
| **Codex** | Sí (`/codex/*` + `/auth/codex/*`) | discovery en status/audit | Sí | Sí | Sí | suscripción/OAuth |
| **Gemini** | Sí (`/gemini/*` + `/auth/gemini/*`) | Sí | Sí | Sí | Sí | Antigravity CLI local |
| **Claude** | Sí (`/claude/*`) | Sí | Sí | Sí | Sí | Claude CLI local / setup-token |
| **Cursor** | Sí (`/cursor/*`) | Sí | Sí | Sí | Sí | Cursor CLI local |

### Asimetrías intencionales

- `provider-auth` embebible hoy cubre **Codex** y **Gemini**.
- **Claude** no entra todavía por `provider-auth/core`; hoy vive como slice local especializado porque su surface real es CLI/runtime local.
- **Cursor** tampoco entra por `provider-auth/core`; hoy vive como facade local del Cursor CLI con auth flow, catálogo y test-message propio.
- Los tres providers ya tienen cobertura de:
- Los cuatro providers ya tienen cobertura de:
  - `status`
  - `test-connection`
  - `test-message`
  - integración por gateway `/v1/chat/completions`

- **Cursor** ya entra al gateway unificado y ahora también expone concurrencia, cancelación y saturación homogénea para su runtime local.

---

## Modos de uso

| Modo | Cuándo usarlo | Entry point |
| --- | --- | --- |
| **Core reusable** | Querés usar el runtime directo desde código | `@local/provider-gateway/core` |
| **Plugin embebible** | Tu app host ya tiene Fastify y querés montar rutas | `@local/provider-gateway/fastify` |
| **Standalone** | Querés desarrollar o probar el módulo aislado | `npm run dev:standalone` |

---

## Quick start

### 1) Plugin embebible para gateway

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

Rutas resultantes típicas:

- `/provider-gateway/providers`
- `/provider-gateway/usage/overview`
- `/provider-gateway/v1/chat/completions`
- `/provider-gateway/auth/codex/start`
- `/provider-gateway/auth/codex/callback`

`providerGatewayPlugin` usa el `prefix` montado para construir el `routePrefix` de provider-auth. Si montás el plugin en `/provider-gateway`, las callbacks host-mode quedan bajo `/provider-gateway/auth/...`.

### 2) Core directo

```ts
import { createProviderGatewayModule } from "@local/provider-gateway/core";

const gateway = createProviderGatewayModule({
  databaseUrl: process.env.DATABASE_URL,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  appApiKeyPepper: process.env.APP_API_KEY_PEPPER,
  allowInsecureCredentialStorage: false,
});

const result = await gateway.handleChatCompletion({
  authorizationHeader: "Bearer <app-api-key>",
  body: {
    model: "minimax/MiniMax-M3",
    messages: [{ role: "user", content: "Hola" }],
  },
});
```

### 3) Standalone opcional

Standalone existe para desarrollar/probar este repo aislado. El camino recomendado para apps reales es embebido.

```bash
npm run dev:standalone
```

---

## Provider auth embebible

`provider-auth` está pensado para **conexiones vivas de cuentas/suscripciones**, no para administrar API keys.

Las API keys siguen en el slice `credential`.

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

Rutas host esperadas:

- `GET /provider-gateway/auth/codex/start`
- `GET /provider-gateway/auth/codex/callback`
- `GET /provider-gateway/auth/codex/status`
- `POST /provider-gateway/auth/codex/logout`
- `GET /provider-gateway/auth/gemini/start`
- `GET /provider-gateway/auth/gemini/callback`
- `GET /provider-gateway/auth/gemini/status`
- `POST /provider-gateway/auth/gemini/logout`

> Nota: `providerAuthPlugin` no expone todavía `/auth/claude/*`. Claude hoy usa su propio slice `/claude/*`.

Happy path host-mode:

1. `GET /provider-gateway/auth/codex/start`
2. callback en `GET /provider-gateway/auth/codex/callback`
3. `GET /provider-gateway/auth/codex/status` → `connected: true`
4. `POST /provider-gateway/auth/codex/logout`
5. `GET /provider-gateway/auth/codex/status` → `connected: false`

---

## Rutas y contratos

### Legacy humana/local

Estas rutas existen para desarrollo manual/local:

- `GET /codex/connect`
- `GET /codex/status`
- `GET /codex/models`
- `POST /codex/test-connection`
- `POST /codex/test-message`
- `DELETE /codex/disconnect`
- `GET /claude/connect`
- `GET /claude/status`
- `POST /claude/import-token`
- `POST /claude/auth/start`
- `GET /claude/auth/:flowId`
- `GET /claude/auth/:flowId/events`
- `POST /claude/auth/:flowId/input`
- `POST /claude/auth/:flowId/cancel`
- `GET /claude/models`
- `POST /claude/test-connection`
- `POST /claude/test-message`
- `DELETE /claude/disconnect`
- `GET /gemini/connect`
- `GET /gemini/status`
- `GET /gemini/capabilities`
- `GET /gemini/models`
- `POST /gemini/auth/start`
- `GET /gemini/auth/:flowId`
- `GET /cursor/status`
- `GET /cursor/capabilities`
- `GET /cursor/models`
- `GET /cursor/connect`
- `POST /cursor/auth/start`
- `GET /cursor/auth/:flowId`
- `GET /cursor/auth/:flowId/events`
- `POST /cursor/auth/:flowId/input`
- `POST /cursor/auth/:flowId/cancel`
- `POST /cursor/auth/logout`
- `POST /cursor/test-connection`
- `POST /cursor/test-message`
- `DELETE /cursor/disconnect`
- `GET /gemini/auth/:flowId/events`
- `POST /gemini/auth/:flowId/input`
- `POST /gemini/auth/:flowId/cancel`
- `POST /gemini/test-connection`
- `POST /gemini/test-message`
- `DELETE /gemini/disconnect`

### Rutas embebibles recomendadas

Estas son las rutas recomendadas para apps host:

- `GET /auth/:provider/start`
- `GET /auth/:provider/callback`
- `GET /auth/:provider/status`
- `POST /auth/:provider/logout`

Hoy esa superficie está implementada para:

- `codex`
- `gemini`

### Status comunes de conexión

- `pending`
- `connected`
- `expired`
- `refresh_failed`
- `revoked`
- `disabled`
- `error`
- `not_connected` (estado presentado cuando no existe conexión)

Campos operativos importantes:

- `connected`
- `reconnectRequired`
- `reason`
- `message`

Errores comunes:

- `provider_connection_not_connected`
- `provider_connection_expired`
- `provider_connection_refresh_failed`
- `provider_connection_revoked`
- `provider_connection_reconnect_required`

Referencia operativa completa:

- `docs/API_REFERENCE.md`

---

## Arquitectura

Decisiones estructurales activas:

- `createProviderGatewayModule()` arma el runtime reusable
- `providerGatewayPlugin` expone el gateway por HTTP
- `providerAuthPlugin` monta auth sobre el servidor host
- `provider-auth` es la **source of truth del lifecycle**
- `/codex/*` es una **facade humana/local**, no el dueño del lifecycle
- `provider_connections` es la tabla source of truth para auth nueva
- `provider_credentials` queda como compat legacy temporal

Guías asociadas:

- `docs/ARCHITECTURE.md`
- `docs/SOFTWARE_DESIGN_GUIDE.md`

---

## Estado de Gemini

Gemini queda definido como una sola superficie:

- `gemini`: Code Assist OAuth + runtime local Antigravity habilitado


- auth OAuth Google inspirado en `gemini-cli` / 9router
- facade local `/gemini/*`
- rutas embebibles `/auth/gemini/*`
- runtime default `antigravity`; es la única superficie Gemini habilitada porque fue la única que permitió requests free/locales en este proyecto
- introspección local del CLI:
  - detección de instalación/ruta/versión
  - capacidades inferidas desde `agy --help` / `agy --version`
  - estado local de sesión (`ready`, `authentication_required`, `cli_not_installed`, etc.)
  - descubrimiento live de modelos via `agy models` con fallback estático
- flujo local de autenticación administrado:
  - `POST /gemini/auth/start`
  - `GET /gemini/auth/:flowId/events`
  - `POST /gemini/auth/:flowId/input`
  - `POST /gemini/auth/:flowId/cancel`
  - no lee, copia ni almacena tokens; solo orquesta una sesión interactiva del CLI oficial
- contrato explícito de identidad local:
  - `identityModel.scope = "local_os_user"`
  - `identityModel.sharedByAllClients = true`
  - una instancia local del gateway comparte la misma sesión Antigravity del usuario del sistema operativo entre todos sus clientes
- base común `local-cli-runtime` para endurecer futuros runtimes CLI:
  - supervisor con límite global de procesos y cola
  - cancelación/timeout mediante `AbortSignal`
  - errores normalizados (`CLI_NOT_INSTALLED`, `AUTH_REQUIRED`, `QUOTA_EXHAUSTED`, `RATE_LIMITED`, etc.)
  - eventos de generación normalizados para runtimes que todavía devuelven respuesta final completa
  - telemetría mínima `ProviderExecutionRecord` sin prompts ni respuestas completas

Variables opcionales:

```env
GEMINI_RUNTIME_SURFACE=antigravity
ANTIGRAVITY_CLI_BIN=agy
ANTIGRAVITY_CLI_TIMEOUT_MS=60000
```

Conclusión actual:

- `gemini` sirve para conectar cuenta y ejecutar requests vía Antigravity CLI local
- `gemini_api`, `vertex`, `oauth_rest`, `cli` y `auth_only` quedaron eliminados del camino habilitado para Gemini
- `antigravity` es el único runtime Gemini activo por defecto

---

## Estado de Claude

Claude queda definido hoy como surface local especializada:

- facade local `/claude/*`
- flujo local interactivo por Claude CLI
- fallback manual `POST /claude/import-token`
- models + test-connection + test-message
- integración por gateway `/v1/chat/completions`
- concurrencia, timeout, cancelación y cleanup de process tree ya endurecidos

Importante:

- Claude **no** entra todavía por `provider-auth/core`
- hoy su auth/runtime viven en el slice `features/claude`

Investigación actual:

- `docs/GEMINI_AUTH_RESEARCH.md`

---

## Scripts

```bash
npm test
npm run typecheck
npm run lint
npm run dev:init
npm run dev:bootstrap
npm run dev:auth:codex
npm run dev:auth:gemini
npm run dev:standalone
npm run dev:codex:switch
```

---

## Versionado

Versión actual:

```txt
0.1.0 — internal foundation
```

El proyecto usa **SemVer** y, por ahora, **lockstep versioning**: core, plugin embebible, standalone/daemon futuro, OpenAPI y SDKs deben compartir la misma versión de producto.

Documentación:

- [`CHANGELOG.md`](./CHANGELOG.md)
- [`docs/VERSIONING.md`](./docs/VERSIONING.md)

---

## Limitaciones actuales

- `provider-auth` embebible hoy cubre Codex y Gemini, no Claude
- los providers futuros deben entrar por strategy, no por lógica especial en `provider-auth/core`
- el refactor grande de multi-cuenta avanzada todavía no está completo
- el rename de tablas legacy no se mezcló con los refactors arquitectónicos

---

## Guías disponibles

| Documento | Para qué sirve |
| --- | --- |
| `docs/PROVIDER_AUTH_EMBEDDING_GUIDE.md` | Integrar auth embebible y entender lifecycle |
| `docs/PROVIDER_INTEGRATION_GUIDE.md` | Integrar gateway/core en otra app |
| `docs/API_REFERENCE.md` | Ver endpoints, responses y errores comunes |
| `docs/GEMINI_AUTH_RESEARCH.md` | Estado real del Batch 2 Gemini y gate de investigación |
| `docs/ARCHITECTURE.md` | Entender ownership, boundaries y composición |
| `docs/SOFTWARE_DESIGN_GUIDE.md` | Entender criterios y decisiones de diseño |
