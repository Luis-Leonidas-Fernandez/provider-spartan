# GEMINI AUTH RESEARCH

Batch 2 se ejecuta en dos pasos:

1. **Research gate**
2. **Implementación solo del modo aprobado**

Este documento registra la investigación inicial para Gemini usando 9router como referencia técnica y Google OAuth como fuente normativa.

---

## Conclusión ejecutiva

La revisión actual revela una conclusión importante:

- **9router demuestra principalmente que `gemini-cli` funciona con callback local (`local_loopback`)**
- **9router NO demuestra que `hosted_web` funcione con un OAuth client web propio del host**

Por eso, en este repo:

- `hosted_web` queda como **objetivo principal**, pero **todavía no aprobado**
- `local_loopback` queda como **modo técnicamente evidenciado para local/dev**
- `codeassist_hosted_code` queda **rechazado por UX**
- `api_key` queda **fuera de alcance** para Batch 2

---

## UX no negociable

Gemini debe conectarse como **cuenta**, no configurarse como **credencial manual**.

El usuario final solo debe:

1. pulsar “Conectar con Google”
2. iniciar sesión o elegir su cuenta
3. aceptar consentimiento
4. volver automáticamente al callback

El usuario final nunca debe introducir:

- API key
- OAuth client ID
- OAuth client secret
- authorization code
- refresh token
- callback URL
- redirected URL

Si un modo requiere credenciales OAuth, esas credenciales pertenecen al **deployment**:

- `gateway_owned`
- `host_owned`

Nunca al usuario final.

---

## Matriz de decisión por modo

| Mode | UX usuario final | Estado actual | Decisión |
| --- | --- | --- | --- |
| `hosted_web` | redirect automático con callback web | no demostrado por 9router | `pending_research` |
| `local_loopback` | redirect automático local | demostrado por 9router `gemini-cli` | `implementable_for_local_dev` |
| `codeassist_hosted_code` | copia manual de código | contradice UX objetivo | `rejected_for_ux` |
| `api_key` | credencial manual | contradice objetivo de conexión como cuenta | `out_of_scope` |

---

## Evidencia revisada

### 9router

Archivos relevantes:

- `src/lib/oauth/providers.js`
- `src/lib/oauth/services/gemini.js`
- `open-sse/providers/shared.js`
- `open-sse/providers/registry/gemini-cli.js`

Hallazgos principales:

- el provider se identifica como `gemini-cli`
- usa base `https://cloudcode-pa.googleapis.com/v1internal`
- usa scopes:
  - `https://www.googleapis.com/auth/cloud-platform`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
- usa OAuth authorization code con:
  - `access_type=offline`
  - `prompt=consent`
- hace exchange con `application/x-www-form-urlencoded`
- llama a:
  - Google user info
  - `v1internal:loadCodeAssist`
- usa credenciales públicas del cliente CLI compartido
- el flujo específico levantado por `src/lib/oauth/services/gemini.js` usa callback local:
  - `http://localhost:<port>/callback`

Conclusión:

- 9router es evidencia fuerte para **`local_loopback`**
- 9router no prueba por sí solo un flujo **`hosted_web`** embebible con callback remoto del host

Además, `open-sse/providers/registry/gemini-cli.js` marca el provider como:

- `deprecated: true`
- `deprecationNotice: "RISK_NOTICE"`

Eso obliga a tratar endpoints privados/emulados como riesgo operativo. La investigación posterior comprobó que Gemini API OAuth/REST exige Google Cloud/OAuth client/billing y no satisface el objetivo no-pay/free-tier del proyecto. La decisión vigente del repo es mantener **solo Gemini via Antigravity local CLI (`agy`)** como runtime activo, con contrato explícito `identityModel.scope = "local_os_user"`. El viejo `@google/gemini-cli` queda legacy porque el free-tier individual devuelve `UNSUPPORTED_CLIENT`.

### Google OAuth

Fuentes normativas:

- [Google OAuth Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth Native Applications](https://developers.google.com/identity/protocols/oauth2/native-app)

Hallazgos principales:

- las web apps requieren un OAuth client propio de aplicación web
- el `redirect_uri` debe coincidir exactamente con uno autorizado
- el `client_secret` se usa server-side y debe mantenerse fuera del código público
- las native/desktop apps pueden usar loopback local

Conclusión:

- `local_loopback` y `hosted_web` no son equivalentes
- que el CLI funcione localmente no demuestra que una app host remota pueda reutilizar el mismo modo sin un OAuth client web compatible

---

## Modelo recomendado para este repo

Mientras no cambie el schema general del provider:

- `providerType: "gemini"`
- `accessMode: "oauth"`
- `integrationVariant: "gemini-cli-code-assist"` en `metadataJson`

No conviene cambiar a `providerType: "gemini-cli"` en este batch porque mezclaría investigación OAuth con churn de schema/tipos.

---

## Metadata y readiness

`loadCodeAssist` no demuestra que runtime real ya esté funcionando.

Metadata recomendada:

```ts
{
  provider: "gemini",
  integrationVariant: "gemini-cli-code-assist",
  authMethod: "oauth",
  accountEmail?: string,
  scopes: string[],
  codeAssist: {
    probeStatus: "not_checked" | "succeeded" | "failed",
    eligibility: "unknown" | "eligible" | "requires_project" | "ineligible",
    runtimeStatus: "untested" | "working" | "failed",
    projectId?: string,
    checkedAt?: string
  }
}
```

Regla:

- OAuth válido => `connected`
- user info falla => conexión sigue viva
- `loadCodeAssist` falla => conexión sigue viva con metadata parcial
- `runtimeStatus: "working"` queda fuera de Batch 2

---

## Requisitos P0 para aprobar `hosted_web`

`hosted_web` solo queda aprobado si un OAuth client web propio demuestra:

- redirect automático a Google
- callback automático del host
- exchange exitoso de `authorization_code`
- refresh funcional
- `userinfo` funcional
- `loadCodeAssist` funcional o al menos best-effort sin romper auth
- `redirect_uri` estable y confiable
- state server-side single-use
- cero copia manual de códigos o URLs

Si eso no se demuestra, Batch 2 no implementa Gemini para apps host remotas.

---

## Decisión actual del research gate

```yaml
technically_reproducible:
  local_loopback: yes
  hosted_web: not_proven

operationally_suitable:
  local_loopback: dev_only_with_risk
  hosted_web: pending

supported_deployment_modes:
  - local_loopback (dev/local only)
  - hosted_web (pending proof)

provider_reference_risk:
  gemini_cli_9router: deprecated_and_risk_flagged
```

---

## Estado después de Batch 2A

Se implementó un corte **local/dev**:

- strategy `gemini` en `provider-auth`
- rutas embebibles `/auth/gemini/*`
- facade humana/local `/gemini/connect`, `/gemini/status`, `/gemini/disconnect`
- metadata best-effort con `userinfo` + `loadCodeAssist`

Lo que **NO** quedó aprobado todavía:

- hosted web general para integradores
- runtime Gemini para chat completions vía Vertex como default; el default local/free ahora es OAuth REST con el access token OAuth persistido
- runtime Antigravity como default; queda bloqueado por depender de CLI/sesión local externa
- surface pública fuera de localhost como camino recomendado

## Próximo paso habilitado

El research sigue abierto para decidir si Gemini puede pasar de `local/dev` a `hosted_web` soportado.
