# SOFTWARE DESIGN GUIDE

Guía de criterio para mantener el proyecto sin romper su dirección arquitectónica.

---

## Criterio rector

Refactor incremental, no reescritura masiva.

---

## Principios activos

- separar runtime reusable antes de mover carpetas por estética
- cortar dependencias globales antes de cambiar transporte
- mantener tests existentes como red de seguridad
- no mezclar refactor estructural con migraciones de datos grandes
- usar vertical slices para cohesión
- usar composición para wiring, no para inventar otra arquitectura paralela

---

## Patrón actual

1. `createProviderGatewayModule(options)` crea el núcleo reusable
2. `providerGatewayPlugin` monta rutas del gateway sobre un módulo existente o crea uno
3. `providerAuthPlugin` monta auth embebible usando el mismo módulo
4. `createStandaloneServer()` envuelve el plugin para dev/testing

---

## Decisiones de diseño vigentes

### `provider-auth` como connection manager

`provider-auth` no se optimiza para API keys.

Su foco es:

- iniciar auth
- completar callback
- persistir conexiones
- refrescar tokens
- exponer lifecycle/status
- desconectar cuentas

### Lifecycle centralizado

El lifecycle no debe repartirse por facades.

Por eso:

- `provider-auth` decide refresh / expired / reconnect required
- `/codex/*` funciona como facade humana/local
- `/gemini/*` funciona como facade humana/local + runtime local
- las apps host deberían apoyarse en `/auth/:provider/*` cuando el provider entre por `provider-auth`
- `Claude` hoy es la excepción deliberada: facade/slice especializado, no `provider-auth`

### Persistencia nueva vs legacy

- `provider_connections` = source of truth para auth nueva
- `provider_credentials` = compatibilidad temporal

### Composition root partida, slices intactos

Los slices siguen en `features/*`.

Lo que se partió fue el wiring interno en `src/core/composition/*`, no la arquitectura por features.

---

## Anti-patterns evitados

- core importando Fastify
- standalone conteniendo lógica de negocio
- duplicar routes para embedded vs standalone
- duplicar lifecycle en `/codex/*`
- renombrar tablas en el mismo cambio del desacople arquitectónico
- meter lógica de provider concreto dentro de `provider-auth/core`

---

## Regla práctica para cambios futuros

Si vas a tocar una feature nueva, primero preguntate:

1. ¿esto pertenece a un slice existente?
2. ¿esto es runtime, transporte o integración externa?
3. ¿esto agrega lógica real o solo wiring?
4. ¿estoy poniendo lifecycle donde no corresponde?

Si una fachada empieza a decidir estados de conexión por su cuenta, vas por mal camino.

---

## Simetría sana

No buscar simetría cosmética.

La pregunta correcta es:

- ¿los providers comparten el mismo **contrato operativo**?
- ¿o estamos forzando a que compartan una implementación que su surface real no soporta?

Hoy la simetría válida es:

- status
- test-connection
- test-message
- gateway
- concurrencia
- timeout
- cancelación
- audit sanitizado

Lo que NO es simétrico todavía:

- `provider-auth` embebible para Claude

Y está bien que no lo sea mientras la surface real de Claude siga siendo local CLI / setup-token.
