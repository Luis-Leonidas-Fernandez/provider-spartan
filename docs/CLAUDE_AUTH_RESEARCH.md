# Claude Auth Research

## Decision

`approved_setup_token`

## Summary

Para este repo, Claude entra primero por **setup-token + Claude Code CLI local**.

No implementamos OAuth browser ni captura de sesión privada.  
No copiamos credenciales internas de Claude Code.  
No tratamos a Claude como un provider-auth clásico de callback.

## Evidence used

### Local CLI verification

Se verificó localmente:

- `claude --version` devuelve una instalación real de Claude Code.
- `claude -p --help` documenta modo no interactivo (`-p/--print`) y selección de modelo (`--model sonnet|opus|claude-sonnet-4-6`).
- `claude setup-token --help` indica que crea un token largo para uso no interactivo y que requiere suscripción Claude.

### Binary/string inspection

La instalación local expone cadenas que indican:

- `Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>`
- `Long-lived tokens (from claude setup-token or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons.`

Eso alcanza para justificar esta variante:

- **authMethod:** `claude_setup_token`
- **runtimeSurface:** `claude_code_cli`
- **env de ejecución:** `CLAUDE_CODE_OAUTH_TOKEN`

## Accepted scope

Este batch aprueba:

- importar manualmente un token generado por `claude setup-token`;
- guardarlo cifrado en `provider_connections`;
- usarlo para `claude -p` en pruebas de conexión y mensajes;
- exponer rutas locales/dev `/claude/*`.

## Rejected scope

Este batch NO aprueba:

- OAuth browser/callback de Claude para terceros;
- scraping de sesión local;
- lectura de `~/.claude`, keychain, cookies o caches privados;
- inventar un provider-auth OAuth que no esté confirmado por documentación oficial.

## Product note

Esto es aceptable como UX **semi-manual** para local/dev y pruebas embebidas:

1. usuario corre `claude setup-token`;
2. copia token;
3. gateway lo importa por `POST /claude/import-token`;
4. runtime usa `CLAUDE_CODE_OAUTH_TOKEN` al invocar Claude CLI.

No es tan fluido como Codex/Gemini connect, pero respeta mejor compliance y SRP para este batch.
