# Versioning

`provider-gateway` se versiona como **producto único**, no como una colección de paquetes independientes.

La regla actual es:

```txt
una release = una versión para todo
```

Esto evita matrices de compatibilidad prematuras entre core, plugin, daemon, OpenAPI y SDKs.

---

## Estrategia actual

Usamos:

- **SemVer**: `MAJOR.MINOR.PATCH`
- **Lockstep versioning**: todas las partes públicas comparten la misma versión
- **API HTTP versionada aparte**: rutas productivas bajo `/v1`

Ejemplo:

```txt
provider-gateway          0.1.0
@provider-gateway/core    0.1.0
provider-gatewayd         0.1.0 futuro
openapi/provider-gateway  0.1.0 futuro
sdk-typescript            0.1.0 futuro
sdk-python                0.1.0 futuro
HTTP API                  /v1
```

---

## Por qué no versionado independiente todavía

No queremos esto en esta etapa:

```txt
core 0.4.0
fastify 0.2.3
daemon 0.5.1
sdk-python 0.1.8
```

Eso obligaría a mantener una matriz de compatibilidad antes de tener un contrato estable.

Por ahora, si el release es `0.3.0`, todo lo publicado en ese corte pertenece a `0.3.0`.

---

## Reglas SemVer

### PATCH

Correcciones compatibles.

Ejemplos:

- fix de audit
- fix de parsing
- fix de timeout
- documentación menor
- errores internos sin romper contrato

```txt
0.1.0 -> 0.1.1
```

### MINOR

Funcionalidad nueva compatible.

Ejemplos:

- provider nuevo
- endpoint nuevo
- campo opcional nuevo
- SDK nuevo
- mejora de runtime sin romper respuestas existentes

```txt
0.1.1 -> 0.2.0
```

### MAJOR

Cambio incompatible.

Ejemplos:

- eliminar endpoint público
- cambiar shape obligatorio de responses
- renombrar errores públicos
- romper `/v1`
- cambiar configuración requerida de forma incompatible

```txt
1.4.2 -> 2.0.0
```

---

## Versionado HTTP

La versión del paquete y la versión de API HTTP no son lo mismo.

Ejemplo:

```txt
Producto: 0.4.0
HTTP API: /v1
```

Mientras el contrato HTTP siga siendo compatible, seguimos usando `/v1`.

Si hay ruptura fuerte del contrato:

```txt
/v2
```

---

## Roadmap de versiones iniciales

| Versión | Objetivo |
| --- | --- |
| `0.1.0` | foundation interna funcional |
| `0.2.0` | empaquetado Node embebible serio |
| `0.3.0` | daemon universal `provider-gatewayd` |
| `0.4.0` | OpenAPI v1 inicial |
| `0.5.0` | SDK TypeScript/Python inicial |
| `1.0.0` | contrato público estable |

---

## Primera versión

La primera versión documentada es:

```txt
0.1.0 — Internal foundation
```

Está registrada en:

- `package.json`
- `CHANGELOG.md`

Todavía no representa una release pública estable.

---

## Futuro release process

Cuando el proyecto tenga repo Git remoto y distribución formal, el flujo recomendado será:

```txt
tag vX.Y.Z
  -> CI
  -> tests
  -> package artifacts
  -> GitHub Release
  -> publish npm/daemon/SDKs
```

Inspiración: el modelo de `gentle-ai`, donde el tag Git dispara el release del producto completo.

