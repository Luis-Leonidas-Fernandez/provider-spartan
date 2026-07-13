# ARCHITECTURE

Resumen corto de ownership, boundaries y composición del repo.

---

## Capas principales

```txt
standalone -> fastify -> core
host app -> fastify plugin -> core
host app -> core directo
```

Interpretación:

- `core` contiene runtime reusable y wiring principal
- `fastify` expone transporte HTTP
- `standalone` existe para dev/testing
- una app host puede usar plugin o core directo

---

## Reglas de boundary

- `src/core` no importa Fastify
- `src/fastify` depende de `src/core`
- `src/standalone` depende de `src/fastify`
- la lógica vive en use cases, no en routes
- no se duplica la lógica entre embedded y standalone

---

## Ownership actual importante

| Área | Dueño |
| --- | --- |
| runtime reusable del gateway | `createProviderGatewayModule()` |
| transporte HTTP general | `providerGatewayPlugin` |
| auth embebible sobre servidor host | `providerAuthPlugin` |
| lifecycle de conexiones | `provider-auth` |
| facade humana/local para Codex | `features/codex` |
| facade humana/local para Gemini | `features/gemini` |
| facade humana/local para Claude | `features/claude` |
| source of truth de auth nueva | `provider_connections` |
| compat legacy de credenciales | `provider_credentials` |

Regla crítica post Batch 1.7:

- `provider-auth` es la **source of truth del lifecycle**
- `/codex/*` adapta esa información, pero no la recalcula
- `/gemini/*` adapta lifecycle compartido para auth y suma runtime local Antigravity
- Claude hoy queda como slice local especializado; no debe contaminar `provider-auth/core`

---

## Simetría actual entre providers

Lo sano acá NO es forzar simetría falsa. La simetría real hoy es:

| Provider | Auth host-mode | Facade local | Runtime local | Gateway `/v1/chat/completions` |
| --- | --- | --- | --- | --- |
| Codex | Sí (`provider-auth`) | Sí | no aplica | Sí |
| Gemini | Sí (`provider-auth`) | Sí | Sí (Antigravity) | Sí |
| Claude | No todavía | Sí | Sí (Claude CLI) | Sí |

Conclusión:

- la **simetría operativa** sí existe: status, test-connection, test-message, gateway, audit, concurrencia
- la **simetría arquitectónica** todavía no es total: Claude no entra por `provider-auth`
- eso es intencional, no deuda accidental

---

## Vertical slices + composition root

Los slices siguen siendo `features/*`.

La composition root no reemplaza los slices: solo hace wiring entre ellos.

Patrón actual:

- `src/features/*` = reglas, casos de uso, transporte por feature
- `src/integrations/*` = adapters externos reutilizables
- `src/core/composition/*` = factories de composición
- `src/core/create-provider-gateway-module.ts` = facade pública del módulo

Esto permite:

- mantener cohesión por feature
- evitar que Fastify se meta en el core
- reutilizar el runtime desde plugin, standalone o código directo

---

## Estructura incremental actual

```txt
src/
  core/
  fastify/
  standalone/
  features/
  integrations/
  provider-auth/
  db/
```

No hace falta leer todo el repo para integrar el sistema:

- si querés usarlo: mirá `README.md` + `docs/API_REFERENCE.md`
- si querés embebido/auth: mirá `docs/PROVIDER_AUTH_EMBEDDING_GUIDE.md`
- si querés mantenerlo: seguí leyendo esta doc + `docs/SOFTWARE_DESIGN_GUIDE.md`

---

## Idea central

`createProviderGatewayModule()` arma el runtime reusable:

- repositories
- services
- use cases
- adapter registry
- eventing y usage
- módulo `providerAuth`
- helpers públicos convenientes

Después:

- `providerGatewayPlugin` lo expone por HTTP
- `providerAuthPlugin` monta auth embebible sobre el servidor host
- `createStandaloneServer()` envuelve todo para desarrollo aislado
