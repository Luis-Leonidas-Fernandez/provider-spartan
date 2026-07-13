# Claude slice

## Qué es

`features/claude` es la **facade local especializada** para Claude en este repo.

Resuelve:

- login local por Claude CLI
- fallback manual por setup-token
- runtime local de requests
- models / status / test-connection / test-message
- integración con el gateway `/v1/chat/completions`

## Qué NO es

Este slice **no** es:

- una strategy de `provider-auth`
- auth embebible host-mode genérica
- un provider OAuth clásico con callback/refresh centralizado

## Por qué vive separado de `provider-auth`

Hoy la surface real de Claude está dominada por:

- CLI local
- flujo interactivo local
- import token fallback
- runtime local y control de procesos

Por eso su responsabilidad principal no es solo `connection lifecycle`, sino una **facade local de runtime + autenticación especializada**.

## Surface pública actual

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
