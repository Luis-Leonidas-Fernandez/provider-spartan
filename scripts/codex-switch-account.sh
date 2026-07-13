#!/bin/zsh
set -euo pipefail
u="${PROVIDER_GATEWAY_URL:-http://127.0.0.1:20128}"
/usr/bin/curl -fsS -X DELETE "$u/codex/disconnect" >/dev/null
open "$u/codex/connect"
read '?Terminá el login y apretá ENTER '
echo
/usr/bin/curl -fsS "$u/codex/status"
echo
