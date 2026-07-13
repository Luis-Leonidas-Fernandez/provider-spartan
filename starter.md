# Provider Gateway Starter

Guía práctica para levantar el proyecto y probar los flujos de **Codex**, **Gemini**, **Claude** y **Cursor**.

> Este archivo es documentación. No ejecuta nada por sí solo.
>
> Ubicación del proyecto: `/Users/luis/Desktop/provider`

---

# 0. Levantar el proyecto

## 0.1 Preparar entorno local

| Paso | Comando | Objetivo |
| --- | --- | --- |
| 1 | `cd /Users/luis/Desktop/provider` | entrar al repo |
| 2 | `npm run dev:init` | crear/completar `.env` y carpetas locales |
| 3 | `npm rebuild better-sqlite3` | recompilar SQLite nativo para tu Node actual |
| 4 | `npm run dev:standalone` | levantar el gateway standalone |

```bash
cd /Users/luis/Desktop/provider
npm run dev:init
npm rebuild better-sqlite3
npm run dev:standalone
```

## 0.2 Verificar que el server esté vivo

En otra terminal:

```bash
curl http://127.0.0.1:20128/health
```

## 0.3 Scripts rápidos de desarrollo

| Provider | Comando | Qué hace |
| --- | --- | --- |
| Codex | `npm run dev:auth:codex` | abre el flujo OAuth humano de Codex |
| Gemini | `npm run dev:auth:gemini` | abre el flujo humano de Gemini/Antigravity |
| Claude | `npm run dev:auth:claude` | inicia el flow local Claude CLI y muestra comandos con `flowId` |
| Cursor | `npm run dev:auth:cursor` | inicia el flow local Cursor CLI y muestra comandos con `flowId` |
| Todos | `npm run dev:status` | muestra status de Codex, Gemini, Claude y Cursor |
| Último audit | `npm run dev:audit -- claude` | muestra el último audit del provider indicado |

---

<br />

# 1. Codex

**Tipo:** OAuth por conexión  
**Runtime:** Codex subscription  
**Identidad:** por conexión, no compartida por usuario local

## 1.1 Resumen del flujo

| Paso | Comando | Objetivo |
| --- | --- | --- |
| 1 | `open /codex/connect` | autenticar cuenta Codex/OpenAI |
| 2 | `GET /codex/status` | ver conexión y metadata |
| 3 | `GET /codex/models` | listar modelos conocidos/disponibles |
| 4 | `POST /codex/test-connection` | validar reachability |
| 5 | `POST /codex/test-message` | enviar mensaje de prueba |
| 6 | `DELETE /codex/disconnect` | desconectar cuenta |

## 1.2 Comandos

```bash
open http://127.0.0.1:20128/codex/connect
```

```bash
curl http://127.0.0.1:20128/codex/status
```

```bash
curl http://127.0.0.1:20128/codex/models
```

```bash
curl -X POST http://127.0.0.1:20128/codex/test-connection
```

```bash
curl -X POST http://127.0.0.1:20128/codex/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado"}'
```

```bash
curl -X DELETE http://127.0.0.1:20128/codex/disconnect
```

---

<br />

# 2. Gemini

**Tipo:** Google OAuth + runtime local  
**Runtime activo:** Antigravity CLI  
**Identidad:** usuario local del sistema operativo

## 2.1 Resumen del flujo

| Paso | Comando | Objetivo |
| --- | --- | --- |
| 1 | `open /gemini/connect` | iniciar conexión Google/Gemini |
| 2 | `GET /gemini/status` | ver estado de auth + runtime |
| 3 | `GET /gemini/capabilities` | inspeccionar CLI local |
| 4 | `GET /gemini/models` | listar modelos Antigravity |
| 5 | `POST /gemini/test-connection` | validar runtime |
| 6 | `POST /gemini/test-message` con alias | probar alias legacy |
| 7 | `POST /gemini/test-message` con label | probar label real descubierto |
| 8 | `DELETE /gemini/disconnect` | desconectar cuenta/sesión |

## 2.2 Comandos

```bash
open http://127.0.0.1:20128/gemini/connect
```

```bash
curl http://127.0.0.1:20128/gemini/status
```

```bash
curl http://127.0.0.1:20128/gemini/capabilities
```

```bash
curl http://127.0.0.1:20128/gemini/models
```

```bash
curl -X POST http://127.0.0.1:20128/gemini/test-connection
```

### Mensaje usando alias legacy

```bash
curl -X POST http://127.0.0.1:20128/gemini/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"gemini-2.5-pro"}'
```

### Mensaje usando label real de Antigravity

```bash
curl -X POST http://127.0.0.1:20128/gemini/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"Gemini 3.1 Pro (High)"}'
```

```bash
curl -X DELETE http://127.0.0.1:20128/gemini/disconnect
```

---

<br />

# 3. Claude

**Tipo:** slice local especializado  
**Runtime:** Claude CLI local  
**Auth:** login local por CLI o fallback `setup-token`

## 3.1 Resumen del flujo

| Paso | Comando | Objetivo |
| --- | --- | --- |
| 1 | `GET /claude/connect` | ver instrucciones |
| 2 | `GET /claude/status` | ver estado local |
| 3 | `POST /claude/auth/start` | iniciar login local |
| 4 | `GET /claude/auth/FLOW_ID` | snapshot del flow |
| 5 | `GET /claude/auth/FLOW_ID/events` | escuchar SSE |
| 6 | `POST /claude/auth/FLOW_ID/input` | enviar input |
| 7 | `POST /claude/auth/FLOW_ID/cancel` | cancelar flow |
| 8 | `POST /claude/import-token` | importar setup-token |
| 9 | `GET /claude/models` | listar modelos |
| 10 | `POST /claude/test-connection` | validar runtime |
| 11 | `POST /claude/test-message` | enviar mensaje |
| 12 | `DELETE /claude/disconnect` | desconectar |

## 3.2 Comandos

```bash
curl http://127.0.0.1:20128/claude/connect
```

```bash
curl http://127.0.0.1:20128/claude/status
```

```bash
curl -X POST http://127.0.0.1:20128/claude/auth/start
```

> Reemplazá `FLOW_ID` por el `flowId` devuelto por `/claude/auth/start`.

```bash
curl http://127.0.0.1:20128/claude/auth/FLOW_ID
```

```bash
curl -N http://127.0.0.1:20128/claude/auth/FLOW_ID/events
```

```bash
curl -X POST http://127.0.0.1:20128/claude/auth/FLOW_ID/input \
  -H "Content-Type: application/json" \
  -d '{"value":"VALUE"}'
```

```bash
curl -X POST http://127.0.0.1:20128/claude/auth/FLOW_ID/cancel
```

### Fallback con setup-token

```bash
curl -X POST http://127.0.0.1:20128/claude/import-token \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN"}'
```

```bash
curl http://127.0.0.1:20128/claude/models
```

```bash
curl -X POST http://127.0.0.1:20128/claude/test-connection
```

```bash
curl -X POST http://127.0.0.1:20128/claude/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"sonnet"}'
```

```bash
curl -X DELETE http://127.0.0.1:20128/claude/disconnect
```

---

<br />

# 4. Cursor

**Tipo:** slice local especializado  
**Runtime:** Cursor CLI local  
**Auth:** flow local gestionado

## 4.1 Resumen del flujo

| Paso | Comando | Objetivo |
| --- | --- | --- |
| 1 | `GET /cursor/connect` | ver instrucciones |
| 2 | `GET /cursor/status` | ver estado local |
| 3 | `GET /cursor/capabilities` | inspeccionar CLI |
| 4 | `GET /cursor/models` | listar modelos |
| 5 | `POST /cursor/auth/start` | iniciar auth local |
| 6 | `GET /cursor/auth/FLOW_ID` | snapshot del flow |
| 7 | `GET /cursor/auth/FLOW_ID/events` | escuchar SSE |
| 8 | `POST /cursor/auth/FLOW_ID/input` | enviar input |
| 9 | `POST /cursor/auth/FLOW_ID/cancel` | cancelar flow |
| 10 | `POST /cursor/test-connection` | validar runtime |
| 11 | `POST /cursor/test-message` | enviar mensaje |
| 12 | `POST /cursor/auth/logout` | logout por CLI |
| 13 | `DELETE /cursor/disconnect` | desconectar convenience |

## 4.2 Comandos

```bash
curl http://127.0.0.1:20128/cursor/connect
```

```bash
curl http://127.0.0.1:20128/cursor/status
```

```bash
curl http://127.0.0.1:20128/cursor/capabilities
```

```bash
curl http://127.0.0.1:20128/cursor/models
```

```bash
curl -X POST http://127.0.0.1:20128/cursor/auth/start
```

> Reemplazá `FLOW_ID` por el `flowId` devuelto por `/cursor/auth/start`.

```bash
curl http://127.0.0.1:20128/cursor/auth/FLOW_ID
```

```bash
curl -N http://127.0.0.1:20128/cursor/auth/FLOW_ID/events
```

```bash
curl -X POST http://127.0.0.1:20128/cursor/auth/FLOW_ID/input \
  -H "Content-Type: application/json" \
  -d '{"value":"VALUE"}'
```

```bash
curl -X POST http://127.0.0.1:20128/cursor/auth/FLOW_ID/cancel
```

```bash
curl -X POST http://127.0.0.1:20128/cursor/test-connection
```

```bash
curl -X POST http://127.0.0.1:20128/cursor/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"Cursor Fast"}'
```

```bash
curl -X POST http://127.0.0.1:20128/cursor/auth/logout
```

```bash
curl -X DELETE http://127.0.0.1:20128/cursor/disconnect
```

---

<br />

# 5. Gateway unificado `/v1/chat/completions`

Usá esta sección cuando querés probar los providers desde la API compatible tipo OpenAI.

## 5.1 Crear app-client, plan y subscription

> Estos comandos preparan un cliente local de prueba. Guardan variables de entorno en la terminal actual.

### Crear app-client

```bash
APP_CLIENT_RESPONSE=$(curl -s -X POST http://127.0.0.1:20128/app-clients \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-client","description":"local starter client"}')

APP_CLIENT_ID=$(printf '%s' "$APP_CLIENT_RESPONSE" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).appClient.id))')
APP_API_KEY=$(printf '%s' "$APP_CLIENT_RESPONSE" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).apiKey))')

printf 'APP_CLIENT_ID=%s\nAPP_API_KEY=%s\n' "$APP_CLIENT_ID" "$APP_API_KEY"
```

### Crear subscription-plan

```bash
PLAN_RESPONSE=$(curl -s -X POST http://127.0.0.1:20128/subscription-plans \
  -H "Content-Type: application/json" \
  -d '{
    "name":"local-dev-plan",
    "monthlyRequestLimit":100000,
    "monthlyTokenLimit":100000000,
    "monthlyBudgetUsd":0,
    "allowedProvidersJson":"[]",
    "allowedModelsJson":"[]",
    "isActive":true
  }')

PLAN_ID=$(printf '%s' "$PLAN_RESPONSE" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).id))')

printf 'PLAN_ID=%s\n' "$PLAN_ID"
```

### Crear app-subscription

```bash
STARTS_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

curl -X POST http://127.0.0.1:20128/app-subscriptions \
  -H "Content-Type: application/json" \
  -d "{\"appClientId\":\"$APP_CLIENT_ID\",\"planId\":\"$PLAN_ID\",\"status\":\"active\",\"startsAt\":\"$STARTS_AT\",\"endsAt\":null}"
```

## 5.2 Probar cada provider por `/v1/chat/completions`

### Codex

```bash
curl -X POST http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $APP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"codex/gpt-5.5","messages":[{"role":"user","content":"Respondé solo: conectado"}]}'
```

### Gemini

```bash
curl -X POST http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $APP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini/gemini-2.5-pro","messages":[{"role":"user","content":"Respondé solo: conectado"}]}'
```

### Claude

```bash
curl -X POST http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $APP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude/sonnet","messages":[{"role":"user","content":"Respondé solo: conectado"}]}'
```

### Cursor

```bash
curl -X POST http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $APP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"cursor/Cursor Fast","messages":[{"role":"user","content":"Respondé solo: conectado"}]}'
```

---

<br />

# 6. Audits útiles

## 6.1 Carpetas

| Área | Carpeta |
| --- | --- |
| lifecycle auth | `.provider-gateway/provider-auth-lifecycle-audit` |
| Codex OAuth | `.provider-gateway/codex-oauth-audit` |
| Codex requests | `.provider-gateway/codex-request-audit` |
| Gemini requests | `.provider-gateway/gemini-request-audit` |
| Claude requests | `.provider-gateway/claude-request-audit` |
| Cursor requests | `.provider-gateway/cursor-request-audit` |

## 6.2 Comandos

```bash
ls -la .provider-gateway/provider-auth-lifecycle-audit
ls -la .provider-gateway/codex-oauth-audit
ls -la .provider-gateway/codex-request-audit
ls -la .provider-gateway/gemini-request-audit
ls -la .provider-gateway/claude-request-audit
ls -la .provider-gateway/cursor-request-audit
```

---

<br />

# 7. Orden recomendado de prueba end-to-end

## 7.1 Primero validar server

```bash
curl http://127.0.0.1:20128/health
```

## 7.2 Después validar providers locales

```bash
curl http://127.0.0.1:20128/codex/status
curl http://127.0.0.1:20128/gemini/status
curl http://127.0.0.1:20128/claude/status
curl http://127.0.0.1:20128/cursor/status
```

## 7.3 Después validar modelos

```bash
curl http://127.0.0.1:20128/codex/models
curl http://127.0.0.1:20128/gemini/models
curl http://127.0.0.1:20128/claude/models
curl http://127.0.0.1:20128/cursor/models
```

## 7.4 Después validar mensajes directos

```bash
curl -X POST http://127.0.0.1:20128/codex/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado"}'

curl -X POST http://127.0.0.1:20128/gemini/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"Gemini 3.1 Pro (High)"}'

curl -X POST http://127.0.0.1:20128/claude/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"sonnet"}'

curl -X POST http://127.0.0.1:20128/cursor/test-message \
  -H "Content-Type: application/json" \
  -d '{"message":"Respondé solo: conectado","model":"Cursor Fast"}'
```
