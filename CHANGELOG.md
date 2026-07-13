# Changelog

Todas las versiones relevantes de `provider-gateway` se documentan acá.

Este proyecto usa **SemVer** y, por ahora, **lockstep versioning**: core, plugin embebible, standalone daemon futuro, OpenAPI y SDKs comparten la misma versión de producto.

---

## 0.1.0 — Internal foundation

Primera versión interna funcional de `provider-gateway`.

### Incluye

- Core reusable vía `createProviderGatewayModule()`.
- Plugin Fastify embebible vía `providerGatewayPlugin`.
- Server standalone de desarrollo.
- Gateway OpenAI-compatible:
  - `POST /v1/chat/completions`.
- Provider auth embebible para conexiones OAuth/suscripción donde aplica.
- Facades humanas/locales:
  - `/codex/*`
  - `/gemini/*`
  - `/claude/*`
  - `/cursor/*`
- Providers integrados al gateway unificado:
  - Codex
  - Gemini vía Antigravity CLI local
  - Claude vía Claude CLI/local setup-token
  - Cursor vía Cursor CLI local
- Status, models, test-connection y test-message para providers principales.
- Auditoría JSON sanitizada por provider/runtime.
- Concurrencia, timeout, cancelación y cleanup de procesos para runtimes CLI principales.
- Fronteras vertical slice reforzadas con tests.
- Modo embedded-first documentado.

### No incluye todavía

- Paquete npm público/privado listo para distribución.
- Binario formal `provider-gatewayd`.
- OpenAPI estable.
- SDKs generados para otros lenguajes.
- Release automatizado por tags.
- Contrato público estable `1.0.0`.

### Estado

`0.1.0` representa una **foundation interna usable**, no una versión pública estable.

