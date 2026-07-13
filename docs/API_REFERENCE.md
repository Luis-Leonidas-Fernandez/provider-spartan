# API REFERENCE

Referencia operativa breve, enfocada en las superficies realmente activas del repo.

---

## Mapa rápido por provider

| Provider | Facade humana/local | Auth embebible `/auth/:provider/*` | Models | Test connection | Test message | Gateway `/v1/chat/completions` |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | `/codex/*` | Sí | discovery en status/audit | Sí | Sí | Sí |
| Gemini | `/gemini/*` | Sí | Sí | Sí | Sí | Sí |
| Claude | `/claude/*` | No todavía | Sí | Sí | Sí | Sí |
| Cursor | `/cursor/*` | Auth local | No | No | No | auth local CLI |

---

## 1) Rutas embebibles recomendadas

Superficie host-mode recomendada para apps cliente:

- `GET /auth/:provider/start`
- `GET /auth/:provider/callback`
- `GET /auth/:provider/status`
- `POST /auth/:provider/logout`

### Providers soportados hoy

- `codex`
- `gemini`

### Status común

Campos operativos esperables:

```json
{
  "connected": true,
  "reconnectRequired": false,
  "reason": null,
  "message": "Connection active"
}
```

Estados / razones relevantes:

- `not_connected`
- `expired`
- `refresh_failed`
- `revoked`
- `disabled`
- `error`

Errores comunes:

- `provider_connection_not_connected`
- `provider_connection_expired`
- `provider_connection_refresh_failed`
- `provider_connection_revoked`
- `provider_connection_reconnect_required`

---

## 2) Rutas humanas/locales de Codex

- `GET /codex/connect`
- `GET /codex/status`
- `GET /codex/models`
- `POST /codex/test-connection`
- `POST /codex/test-message`
- `DELETE /codex/disconnect`

### `GET /codex/connect`

Redirige al flujo de autenticación local.

### `GET /codex/status`

Devuelve estado de conexión + metadata segura:

- `connected`
- `reconnectRequired`
- `reason`
- `message`
- `providerId`
- `providerType`
- `authMethod`
- `runtimeSurface`
- `identityModel`
- `loginStatus`
- `refreshTokenExists`
- `tokenExpiresAt`
- `lastRefreshAt`
- `accountEmail`
- `chatgptAccountId`
- `chatgptPlanType`
- `accountModelDiscovery`


### `GET /codex/models`

Lista el catálogo seguro de modelos Codex disponible para la cuenta/conexión actual. Mantiene una forma simétrica con Gemini, Claude y Cursor, sin asumir que todos descubren modelos por el mismo mecanismo.

Campos principales:

- `providerId`
- `connected`
- `runtimeSurface`
- `discoverySource`
- `availableModels`
- `knownModels`
- `knownModelKeys`
- `recommendedModel`
- `recommendedLabels`
- `accountModelDiscovery`

### `POST /codex/test-connection`

Valida que la suscripción Codex sea usable.

### `POST /codex/test-message`

Request mínimo:

```json
{
  "message": "Respondé solo: conectado"
}
```

### `DELETE /codex/disconnect`

Desconecta la cuenta Codex actual.

---

## 3) Rutas humanas/locales de Gemini

- `GET /gemini/connect`
- `GET /gemini/status`
- `GET /gemini/capabilities`
- `GET /gemini/models`
- `POST /gemini/auth/start`
- `GET /gemini/auth/:flowId`
- `GET /gemini/auth/:flowId/events`
- `POST /gemini/auth/:flowId/input`
- `POST /gemini/auth/:flowId/cancel`
- `POST /gemini/test-connection`
- `POST /gemini/test-message`
- `DELETE /gemini/disconnect`

### Modelo actual

Gemini quedó habilitado **solo** con:

- OAuth Google para cuenta/metadata
- runtime local **Antigravity CLI**

No hay `oauth_rest`, `vertex`, `gemini_api` ni `auth_only` activos.

### `GET /gemini/status`

Devuelve estado de conexión + runtime local:

```json
{
  "connected": true,
  "reconnectRequired": false,
  "reason": null,
  "message": "Connection active",
  "runtimeSurface": "antigravity",
  "executionMode": "local-cli",
  "identityModel": {
    "scope": "local_os_user",
    "sharedByAllClients": true
  },
  "concurrency": {
    "activeCount": 0,
    "queuedCount": 0,
    "maxConcurrent": 2,
    "maxQueueSize": 20
  }
}
```

Campos útiles:

- `cli`
- `capabilities`
- `localCliState`
- `localCliAuthenticated`
- `runtimeReady`
- `runtimeStatus`
- `verifiedWorkingModels`
- `lastRuntimeError`

### `GET /gemini/capabilities`

Introspección del CLI Antigravity:

- instalado o no
- path
- versión
- capacidades detectadas
- estado local de sesión

### `GET /gemini/models`

Lista modelos disponibles para Antigravity:

- intenta discovery live vía `agy models`
- cae a fallback estático si hace falta
- guarda audit con `catalogModelKey`, labels y variantes

### `POST /gemini/auth/start`

Lanza un flujo interactivo administrado de Antigravity CLI.

### `GET /gemini/auth/:flowId/events`

SSE con eventos:

- `started`
- `output`
- `open_url`
- `input_required`
- `authenticated`
- `failed`
- `cancelled`

### `POST /gemini/test-connection`

Valida conexión activa + runtime Antigravity usable.

### `POST /gemini/test-message`

Request mínimo:

```json
{
  "message": "Respondé solo: conectado",
  "model": "gemini-2.5-pro"
}
```

También acepta labels reales descubiertas por Antigravity.

### `DELETE /gemini/disconnect`

Desconecta la cuenta Gemini actual.

---

## 4) Rutas humanas/locales de Claude

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

### Modelo actual

Claude hoy vive como **slice local especializado**:

- login local por Claude CLI
- import token manual como fallback
- runtime CLI local
- todavía no entra por `provider-auth/core`

### `GET /claude/status`

Expone:

- lifecycle de conexión
- `authMethod`
- `runtimeSurface`
- `identityModel`
- `cli`
- `concurrency`
- `capabilities`
- `runtimeStatus`
- `tokenExists`
- `maskedValue`
- `verifiedWorkingModels`

### `POST /claude/import-token`

Fallback manual para importar token de setup.

Body:

```json
{
  "token": "..."
}
```

### `POST /claude/auth/start`

Inicia un flujo local interactivo del CLI.

### `GET /claude/models`

Devuelve catálogo fallback documentado para aliases Sonnet/Opus.

### `POST /claude/test-message`

Request mínimo:

```json
{
  "message": "Respondé solo: conectado",
  "model": "sonnet"
}
```

### `DELETE /claude/disconnect`

Desconecta la conexión Claude actual.

---

## 5) Gateway OpenAI-compatible

Antes del gateway, hoy Cursor está en Batch A:

## 5) Rutas humanas/locales de Cursor

- `GET /cursor/connect`
- `GET /cursor/status`
- `GET /cursor/capabilities`
- `GET /cursor/models`
- `POST /cursor/auth/start`
- `GET /cursor/auth/:flowId`
- `GET /cursor/auth/:flowId/events`
- `POST /cursor/auth/:flowId/input`
- `POST /cursor/auth/:flowId/cancel`
- `POST /cursor/auth/logout`
- `POST /cursor/test-connection`
- `POST /cursor/test-message`
- `DELETE /cursor/disconnect`

### Modelo actual

Cursor hoy está en **Batch D**:

- detección del binario local
- status headless
- capabilities detectadas
- auth flow local gestionada
- models discovery por CLI
- test-connection local
- test-message local
- ya entra por `/v1/chat/completions`

### `GET /cursor/connect`

Devuelve instrucciones del flow local y si la versión detectada soporta login verificable.

### `GET /cursor/status`

Devuelve:

- `connected`
- `reconnectRequired`
- `state`
- `concurrency`
- `cli`
- `authentication`
- `capabilities`
- `actions`
- `identityModel`

### `GET /cursor/capabilities`

Devuelve la inspección de:

- `--help`
- `--version`
- `status --help`
- `login --help`
- `models --help`

### `GET /cursor/models`

Devuelve el catálogo descubierto dinámicamente desde `cursor models`.

### `POST /cursor/auth/start`

Inicia el flow local interactivo del Cursor CLI.

### `GET /cursor/auth/:flowId/events`

Entrega eventos SSE del flow:

- `started`
- `output`
- `open_url`
- `input_required`
- `authenticated`
- `failed`
- `cancelled`

### `POST /cursor/auth/logout`

Pide logout al CLI detectado, si la versión soporta logout.

### `POST /cursor/test-connection`

Ejecuta una verificación corta del Cursor CLI autenticado dentro de un workspace aislado.

### `POST /cursor/test-message`

Envía un prompt de prueba al Cursor CLI local.

Body mínimo:

```json
{
  "message": "Respondé solo: conectado",
  "model": "Cursor Fast"
}
```

---

## 6) Gateway OpenAI-compatible

### `POST /v1/chat/completions`

Entry point común para apps cliente.

Request mínimo:

```json
{
  "model": "gemini/gemini-2.5-pro",
  "messages": [
    { "role": "user", "content": "Hola" }
  ]
}
```

Ejemplos de prefijo de provider:

- `codex/gpt-5.5`
- `gemini/gemini-2.5-pro`
- `claude/sonnet`

### Comportamiento cubierto hoy

- success path
- timeout
- `provider_busy`
- `queue_full`
- `process_cancelled`

Eso ya está probado en gateway para:

- Claude
- Gemini

y funcionalmente cubierto para Codex.

---

## 6) Auditoría

El repo guarda auditoría sanitizada por surface.

Ejemplos:

- `.provider-gateway/provider-auth-lifecycle-audit`
- `.provider-gateway/codex-request-audit`
- `.provider-gateway/gemini-request-audit`
- `.provider-gateway/claude-request-audit`

Nunca se deben guardar:

- access tokens
- refresh tokens
- client secrets
- prompts completos
- respuestas completas

---

## Ver también

- `README.md`
- `docs/PROVIDER_AUTH_EMBEDDING_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/SOFTWARE_DESIGN_GUIDE.md`
