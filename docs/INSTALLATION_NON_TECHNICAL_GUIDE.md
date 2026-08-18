# Guía simple de instalación de Spartan en Windows

Esta guía es para usar **Provider Spartan en Windows** sin entrar en detalles técnicos internos.

Objetivo:

```txt
App cliente → Provider Spartan → proveedores de IA conectados
```

En palabras simples: Spartan queda corriendo en tu PC y tu app cliente le pide respuestas usando una API key local.

---

## 1. Qué necesitás instalado

| Requisito | Para qué sirve |
| --- | --- |
| Node.js LTS | Para instalar dependencias y levantar Spartan. |
| PowerShell | Para copiar y ejecutar los comandos de esta guía. |
| Git | Para descargar Spartan desde GitHub. Si no usás Git, podés descargar el ZIP. |
| Provider Spartan descargado | El proyecto que contiene este repo. |
| Una app cliente | La app que va a usar Spartan. |
| Al menos un provider conectado | Codex, Gemini, Claude o Cursor. |

> En esta guía usamos PowerShell. No uses los comandos de macOS/Linux como `open`, `date -u` o rutas `/Users/...`.

### Verificar que Node.js y npm existen

Copiá esto en PowerShell:

```powershell
node -v
npm -v
```

Si esos comandos no responden con una versión, primero instalá **Node.js LTS** y volvé a abrir PowerShell.

---

## 2. Descargar Spartan

Si tenés Git instalado, descargalo así:

```powershell
Set-Location "C:\Users\Name\Desktop"
git clone https://github.com/Luis-Leonidas-Fernandez/provider-spartan.git provider
```

Si no tenés Git, alternativa simple:

1. Entrá a `https://github.com/Luis-Leonidas-Fernandez/provider-spartan`.
2. Tocá **Code**.
3. Tocá **Download ZIP**.
4. Extraé el ZIP en:

```txt
C:\Users\Name\Desktop\provider
```

---

## 3. Abrir PowerShell en la carpeta de Spartan

Ejemplo de ruta en Windows:

```powershell
Set-Location "C:\Users\Name\Desktop\provider"
```

Si tu carpeta está en otro lugar, cambiá esa ruta por la tuya.

---

## 4. Instalar dependencias

```powershell
npm install
```

Si alguna vez cambiaste de versión de Node.js y aparece un error con `better-sqlite3`, ejecutá:

```powershell
npm rebuild better-sqlite3
```

Si `npm install` falla compilando dependencias nativas, instalá **Visual Studio Build Tools** con soporte para C++ y volvé a ejecutar `npm install`.

---

## 5. Crear el archivo `.env` de Spartan

En Windows no usamos `npm run dev:init` porque ese script usa Bash/Zsh. Creamos el `.env` directamente con PowerShell.

### 5.1 Generar los secretos del `.env`

Antes de crear el archivo, generá estos dos valores.

| Variable | Cómo se obtiene | Para qué sirve |
| --- | --- | --- |
| `APP_API_KEY_PEPPER` | La generás una vez con Node.js. | Spartan la usa para hashear las API keys de apps cliente. |
| `CREDENTIAL_ENCRYPTION_KEY` | La generás una vez con Node.js. | Spartan la usa para cifrar tokens y credenciales de providers. |

Copiá y ejecutá:

```powershell
$APP_API_KEY_PEPPER = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$CREDENTIAL_ENCRYPTION_KEY = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

"APP_API_KEY_PEPPER=$APP_API_KEY_PEPPER"
"CREDENTIAL_ENCRYPTION_KEY=$CREDENTIAL_ENCRYPTION_KEY"
```

Importante:

- guardá estos valores;
- no los subas a GitHub;
- no los cambies todos los días;
- si cambiás `APP_API_KEY_PEPPER`, las API keys de apps cliente anteriores dejan de validar;
- si cambiás `CREDENTIAL_ENCRYPTION_KEY`, puede que Spartan no pueda descifrar credenciales guardadas antes.

### 5.2 Crear `.env` usando esos valores

Después de generar los secretos, ejecutá:

```powershell
@"
APP_ENV=development
LOG_LEVEL=info
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=20128
DATABASE_URL=file:./provider_gateway.db
APP_API_KEY_PEPPER=$APP_API_KEY_PEPPER
CREDENTIAL_ENCRYPTION_KEY=$CREDENTIAL_ENCRYPTION_KEY
PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR=.provider-gateway/provider-auth-lifecycle-audit
CODEX_OAUTH_AUDIT_DIR=.provider-gateway/codex-oauth-audit
CODEX_REQUEST_AUDIT_DIR=.provider-gateway/codex-request-audit
CODEX_ACCOUNT_DISCOVERY_DIR=.provider-gateway/codex-account-discovery
GEMINI_REQUEST_AUDIT_DIR=.provider-gateway/gemini-request-audit
CLAUDE_REQUEST_AUDIT_DIR=.provider-gateway/claude-request-audit
CURSOR_REQUEST_AUDIT_DIR=.provider-gateway/cursor-request-audit
GEMINI_RUNTIME_SURFACE=antigravity
ANTIGRAVITY_CLI_BIN=agy
ANTIGRAVITY_CLI_TIMEOUT_MS=60000
CLAUDE_RUNTIME_SURFACE=claude_code_cli
CLAUDE_CLI_BIN=claude
CLAUDE_CLI_TIMEOUT_MS=60000
ALLOW_INSECURE_CREDENTIAL_STORAGE=false
"@ | Set-Content -Encoding UTF8 .env
```

### 5.3 Qué valores del `.env` no son API keys

No todo lo que aparece en `.env` es una API key.

| Variable | Qué es |
| --- | --- |
| `DATABASE_URL` | Ubicación de la base SQLite local. |
| `PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR` | Carpeta donde Spartan guarda auditoría de auth. |
| `CODEX_REQUEST_AUDIT_DIR` | Carpeta de auditoría de requests Codex. |
| `GEMINI_REQUEST_AUDIT_DIR` | Carpeta de auditoría de requests Gemini. |
| `CLAUDE_REQUEST_AUDIT_DIR` | Carpeta de auditoría de requests Claude. |
| `CURSOR_REQUEST_AUDIT_DIR` | Carpeta de auditoría de requests Cursor. |
| `ANTIGRAVITY_CLI_BIN` | Comando o ruta del runtime Antigravity/Gemini. |
| `CLAUDE_CLI_BIN` | Comando o ruta del runtime Claude. |

La API key que usa tu app cliente, `SPARTAN_APP_CLIENT_API_KEY`, **no va en el `.env` de Spartan**. Esa se genera más adelante y va en el `.env` de la app cliente.

### 5.4 Crear carpetas de auditoría

Después creá las carpetas de auditoría:

```powershell
New-Item -ItemType Directory -Force .provider-gateway\provider-auth-lifecycle-audit | Out-Null
New-Item -ItemType Directory -Force .provider-gateway\codex-oauth-audit | Out-Null
New-Item -ItemType Directory -Force .provider-gateway\codex-request-audit | Out-Null
New-Item -ItemType Directory -Force .provider-gateway\codex-account-discovery | Out-Null
New-Item -ItemType Directory -Force .provider-gateway\gemini-request-audit | Out-Null
New-Item -ItemType Directory -Force .provider-gateway\claude-request-audit | Out-Null
New-Item -ItemType Directory -Force .provider-gateway\cursor-request-audit | Out-Null
```

---

## 6. Levantar Spartan

En la misma carpeta:

```powershell
npm run dev:standalone
```

Dejá esa ventana abierta. Spartan debería quedar disponible en:

```txt
http://127.0.0.1:20128
```

Para seguir con los próximos pasos, abrí **otra ventana de PowerShell**.

---

## 7. Conectar un provider

Antes de conectar, revisá esta tabla. Cada provider puede necesitar una app local o sesión previa.

| Provider | Qué necesitás antes |
| --- | --- |
| Codex | Una cuenta ChatGPT/Codex que pueda iniciar sesión en el navegador. |
| Gemini | Runtime local Antigravity disponible como `agy`, si vas a usar Gemini local. |
| Claude | Claude CLI disponible como `claude`, si vas a usar Claude local. |
| Cursor | Cursor CLI configurado, si vas a usar Cursor local. |

Desde la segunda ventana de PowerShell, abrí el provider que quieras usar.

| Provider | Comando Windows |
| --- | --- |
| Codex | `Start-Process "http://127.0.0.1:20128/codex/connect"` |
| Gemini | `Start-Process "http://127.0.0.1:20128/gemini/connect"` |
| Claude | `Start-Process "http://127.0.0.1:20128/claude/status"` |
| Cursor | `Start-Process "http://127.0.0.1:20128/cursor/status"` |

Ejemplo con Codex:

```powershell
Start-Process "http://127.0.0.1:20128/codex/connect"
```

Verificá el estado:

```powershell
Invoke-RestMethod "http://127.0.0.1:20128/codex/status"
```

Buscá que el provider esté conectado o saludable.

---

## 8. Crear la API key para tu app cliente

### De dónde sale `SPARTAN_APP_CLIENT_API_KEY`

`SPARTAN_APP_CLIENT_API_KEY` **no se inventa y no se busca en ningún panel externo**.

La genera Spartan cuando creás una app cliente llamando a este endpoint:

```txt
POST http://127.0.0.1:20128/app-clients
```

La respuesta de Spartan trae dos datos importantes:

| Dato | Para qué sirve |
| --- | --- |
| `appClient.id` | Identifica a la app cliente dentro de Spartan. |
| `apiKey` | Esta es la key real que debés guardar como `SPARTAN_APP_CLIENT_API_KEY`. |

La key normalmente empieza con:

```txt
pgw_...
```

### Comando para generarla

Copiá y ejecutá esto en PowerShell:

```powershell
$appClientBody = @{
  name = "my-client-app"
  description = "Client app using Provider Spartan"
} | ConvertTo-Json

$appClientResponse = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:20128/app-clients" -ContentType "application/json" -Body $appClientBody

$APP_CLIENT_ID = $appClientResponse.appClient.id
$SPARTAN_APP_CLIENT_API_KEY = $appClientResponse.apiKey

"APP_CLIENT_ID=$APP_CLIENT_ID"
"SPARTAN_APP_CLIENT_API_KEY=$SPARTAN_APP_CLIENT_API_KEY"
```

### Qué tenés que copiar

Después de ejecutar el comando, PowerShell va a mostrar algo parecido a esto:

```txt
APP_CLIENT_ID=4a1f...
SPARTAN_APP_CLIENT_API_KEY=pgw_abc123...
```

Tenés que copiar **solo el valor completo después del `=`**:

```env
SPARTAN_APP_CLIENT_API_KEY=pgw_abc123...
```

Guardalo en el `.env` de tu app cliente.

> Importante: Spartan muestra esta key una sola vez. Si la perdés, tenés que rotarla y guardar la nueva.

Para usarla en esta misma ventana de PowerShell:

```powershell
$env:SPARTAN_APP_CLIENT_API_KEY = $SPARTAN_APP_CLIENT_API_KEY
```

---

## 9. Crear un plan local y una suscripción

Spartan necesita una suscripción activa para permitir que la app cliente use el gateway.

```powershell
$planBody = @{
  name = "local-dev-plan"
  monthlyRequestLimit = 100000
  monthlyTokenLimit = 100000000
  monthlyBudgetUsd = 0
  allowedProvidersJson = "[]"
  allowedModelsJson = "[]"
  isActive = $true
} | ConvertTo-Json

$planResponse = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:20128/subscription-plans" -ContentType "application/json" -Body $planBody

$PLAN_ID = $planResponse.id
$STARTS_AT = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$appSubscriptionBody = @{
  appClientId = $APP_CLIENT_ID
  planId = $PLAN_ID
  status = "active"
  startsAt = $STARTS_AT
  endsAt = $null
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:20128/app-subscriptions" -ContentType "application/json" -Body $appSubscriptionBody
```

Esto no significa que Spartan cobre dinero. Es solo un permiso local para que esa app cliente pueda llamar al gateway.

---

## 10. Poner la key en la app cliente

En el archivo `.env` de tu app cliente agregá:

```env
SPARTAN_BASE_URL=http://127.0.0.1:20128
SPARTAN_APP_CLIENT_API_KEY=pgw_reemplazar_por_la_key_generada
```

Ejemplo de ubicación de una app cliente en Windows:

```txt
C:\Users\Luis\Desktop\PROYECTOS\summary-videoss\.env
```

Podés crearlo desde PowerShell así:

```powershell
Set-Location "C:\Users\Luis\Desktop\PROYECTOS\summary-videoss"

@"
SPARTAN_BASE_URL=http://127.0.0.1:20128
SPARTAN_APP_CLIENT_API_KEY=$SPARTAN_APP_CLIENT_API_KEY
"@ | Add-Content -Encoding UTF8 .env
```

---

## 11. Probar el gateway unificado

Volvé a la ventana donde tenés la variable `SPARTAN_APP_CLIENT_API_KEY` cargada.

### Probar Codex

```powershell
$chatBody = @{
  model = "codex/gpt-5.5"
  messages = @(
    @{ role = "user"; content = "Respondé solo: conectado" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:20128/v1/chat/completions" -Headers @{ Authorization = "Bearer $env:SPARTAN_APP_CLIENT_API_KEY" } -ContentType "application/json" -Body $chatBody
```

### Probar Gemini

```powershell
$chatBody = @{
  model = "gemini/gemini-2.5-pro"
  messages = @(
    @{ role = "user"; content = "Respondé solo: conectado" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:20128/v1/chat/completions" -Headers @{ Authorization = "Bearer $env:SPARTAN_APP_CLIENT_API_KEY" } -ContentType "application/json" -Body $chatBody
```

Si recibís respuesta del modelo, la API key funciona.

### Nota sobre generación de imágenes

Para generar imágenes desde Spartan hoy necesitás configurar un provider con API real de imágenes, por ejemplo **OpenAI Platform** con una `OPENAI_API_KEY`.

Una suscripción **ChatGPT Plus** sirve para generar imágenes dentro de ChatGPT, pero no le da a Spartan acceso externo a imágenes por Codex.

---

## 12. Instalar Spartan como paquete local en otra app

Primero generá el paquete desde Spartan:

```powershell
Set-Location "C:\Users\Luis\Desktop\provider"
npm run build:package
npm run pack:local
```

Después instalalo desde la app cliente:

```powershell
Set-Location "C:\Users\Luis\Desktop\PROYECTOS\summary-videoss"
npm install "C:\Users\Luis\Desktop\provider\provider-spartan-0.1.0.tgz"
```

Luego tu backend Node/Express puede importar Spartan.

Ejemplo Express:

```ts
import { createProviderGatewayExpressAdapter } from "provider-spartan/express";
```

---

## 13. Errores comunes

| Problema | Qué significa | Cómo resolverlo |
| --- | --- | --- |
| `401 Unauthorized` | Falta la API key o está mal. | Revisá `SPARTAN_APP_CLIENT_API_KEY`. |
| `provider_connection_not_connected` | El provider no está conectado. | Volvé a conectar o revisar el status del provider. |
| `default_provider_missing` | No hay provider default o el provider pedido no existe. | Usá prefijo explícito como `codex/...` o `gemini/...`. |
| Perdí la key `pgw_...` | Spartan solo la muestra una vez. | Rotá la key y guardá la nueva. |
| Error con `better-sqlite3` | Node cambió o el módulo nativo quedó viejo. | Ejecutá `npm rebuild better-sqlite3`. |

Rotar la key:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:20128/app-clients/$APP_CLIENT_ID/rotate-key"
```

---

## Checklist final

- [ ] Spartan está corriendo en `http://127.0.0.1:20128`.
- [ ] Al menos un provider está conectado o saludable.
- [ ] Creaste el app-client.
- [ ] Guardaste `SPARTAN_APP_CLIENT_API_KEY`.
- [ ] Creaste el plan local.
- [ ] Creaste la app-subscription.
- [ ] Tu app cliente tiene `SPARTAN_BASE_URL` y `SPARTAN_APP_CLIENT_API_KEY` en su `.env`.
- [ ] `/v1/chat/completions` responde correctamente.
