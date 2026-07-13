# Cursor CLI Subscription (Batch A)

Estado actual:

- detección del binario local
- inspección de capabilities
- status headless
- login flow local gestionada
- models discovery por CLI
- sin runtime todavía

## Objetivo del batch

Este corte valida:

1. si el CLI realmente está instalado;
2. si el binario correcto es `agent`, `cursor-agent` o uno custom;
3. qué capacidades expone de verdad la versión instalada;
4. si el gateway puede diagnosticar el estado sin tocar tokens, keyring ni archivos privados;
5. si puede iniciar/cancelar un login local sin reimplementar OAuth privado.

## Rutas disponibles

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/cursor/connect` | devuelve instrucciones del flow local |
| GET | `/cursor/status` | devuelve estado local del CLI |
| GET | `/cursor/capabilities` | devuelve capacidades detectadas |
| GET | `/cursor/models` | lista modelos descubiertos desde el CLI |
| POST | `/cursor/auth/start` | inicia flow local |
| GET | `/cursor/auth/:flowId` | devuelve snapshot del flow |
| GET | `/cursor/auth/:flowId/events` | stream SSE del flow |
| POST | `/cursor/auth/:flowId/input` | envía input al flow |
| POST | `/cursor/auth/:flowId/cancel` | cancela el flow |
| POST | `/cursor/auth/logout` | intenta logout del CLI |
| DELETE | `/cursor/disconnect` | convenience local para logout |

## Variables

| Variable | Uso |
| --- | --- |
| `CURSOR_CLI_PATH` | fuerza una ruta explícita al binario |
| `CURSOR_CLI_TIMEOUT_MS` | timeout para inspección de help/status |

## Restricciones

- no usa `provider-auth`
- no lee credenciales privadas
- no ejecuta chat todavía
- no lista modelos todavía
- no expone flags arbitrarios
