#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_DIR="$(
  cd "$(/usr/bin/dirname "$0")"
  /bin/pwd
)"
ROOT_DIR="$(
  cd "$SCRIPT_DIR/.."
  /bin/pwd
)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.example"
DEFAULT_URL="${PROVIDER_GATEWAY_URL:-http://127.0.0.1:20128}"

ensure_line() {
  local key="$1"
  local value="$2"
  if /usr/bin/grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  /bin/echo "${key}=${value}" >> "$ENV_FILE"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
      /bin/cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    else
      : > "$ENV_FILE"
    fi
  fi

  ensure_line "APP_ENV" "development"
  ensure_line "LOG_LEVEL" "info"
  ensure_line "GATEWAY_HOST" "127.0.0.1"
  ensure_line "GATEWAY_PORT" "20128"
  ensure_line "DATABASE_URL" "file:./provider_gateway.db"
  ensure_line "APP_API_KEY_PEPPER" "dev-pepper"
  ensure_line "CREDENTIAL_ENCRYPTION_KEY" "test-encryption-secret"
  ensure_line "PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR" ".provider-gateway/provider-auth-lifecycle-audit"
  ensure_line "CODEX_OAUTH_AUDIT_DIR" ".provider-gateway/codex-oauth-audit"
  ensure_line "CODEX_REQUEST_AUDIT_DIR" ".provider-gateway/codex-request-audit"
  ensure_line "CODEX_ACCOUNT_DISCOVERY_DIR" ".provider-gateway/codex-account-discovery"
  ensure_line "GEMINI_REQUEST_AUDIT_DIR" ".provider-gateway/gemini-request-audit"
  ensure_line "CLAUDE_REQUEST_AUDIT_DIR" ".provider-gateway/claude-request-audit"
  ensure_line "CURSOR_REQUEST_AUDIT_DIR" ".provider-gateway/cursor-request-audit"
  ensure_line "GEMINI_RUNTIME_SURFACE" "antigravity"
  if [[ -x "$HOME/.local/bin/agy" ]]; then
    ensure_line "ANTIGRAVITY_CLI_BIN" "$HOME/.local/bin/agy"
  else
    ensure_line "ANTIGRAVITY_CLI_BIN" "agy"
  fi
  ensure_line "ANTIGRAVITY_CLI_TIMEOUT_MS" "60000"
  ensure_line "ALLOW_INSECURE_CREDENTIAL_STORAGE" "false"
  normalize_legacy_gemini_runtime
}

normalize_legacy_gemini_runtime() {
  if /usr/bin/grep -q '^GEMINI_RUNTIME_SURFACE=auth_only$' "$ENV_FILE" 2>/dev/null; then
    /usr/bin/sed -i.bak 's/^GEMINI_RUNTIME_SURFACE=auth_only$/GEMINI_RUNTIME_SURFACE=antigravity/' "$ENV_FILE"
    /bin/rm -f "$ENV_FILE.bak"
  fi
  if /usr/bin/grep -q '^GEMINI_RUNTIME_SURFACE=cli$' "$ENV_FILE" 2>/dev/null; then
    /usr/bin/sed -i.bak 's/^GEMINI_RUNTIME_SURFACE=cli$/GEMINI_RUNTIME_SURFACE=antigravity/' "$ENV_FILE"
    /bin/rm -f "$ENV_FILE.bak"
  fi
  if /usr/bin/grep -q '^GEMINI_RUNTIME_SURFACE=oauth_rest$' "$ENV_FILE" 2>/dev/null; then
    /usr/bin/sed -i.bak 's/^GEMINI_RUNTIME_SURFACE=oauth_rest$/GEMINI_RUNTIME_SURFACE=antigravity/' "$ENV_FILE"
    /bin/rm -f "$ENV_FILE.bak"
  fi
}

ensure_directories() {
  /bin/mkdir -p \
    "$ROOT_DIR/.provider-gateway/provider-auth-lifecycle-audit" \
    "$ROOT_DIR/.provider-gateway/codex-oauth-audit" \
    "$ROOT_DIR/.provider-gateway/codex-request-audit" \
    "$ROOT_DIR/.provider-gateway/codex-account-discovery" \
    "$ROOT_DIR/.provider-gateway/gemini-request-audit" \
    "$ROOT_DIR/.provider-gateway/claude-request-audit" \
    "$ROOT_DIR/.provider-gateway/cursor-request-audit"
}

ensure_dependencies() {
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    /bin/echo "Faltan dependencias. Corré: npm install"
    exit 1
  fi
}

print_summary() {
  /bin/echo
  /bin/echo "Listo."
  /bin/echo "Server URL: $DEFAULT_URL"
  /bin/echo "Env file:   $ENV_FILE"
  /bin/echo "Audit dir:  $ROOT_DIR/.provider-gateway/provider-auth-lifecycle-audit"
  /bin/echo
  /bin/echo "Codex:  $DEFAULT_URL/codex/connect"
  /bin/echo "Gemini: $DEFAULT_URL/gemini/connect"
  /bin/echo "Claude: $DEFAULT_URL/claude/connect"
  /bin/echo "Cursor: $DEFAULT_URL/cursor/connect"
  /bin/echo
}

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url"
  else
    /bin/echo "Abrí manualmente: $url"
  fi
}

show_status() {
  local provider="${1:-}"
  case "$provider" in
    codex|gemini|claude|cursor)
      /usr/bin/curl -fsS "$DEFAULT_URL/$provider/status"
      /bin/echo
      ;;
    *)
      /usr/bin/curl -fsS "$DEFAULT_URL/codex/status" || true
      /bin/echo
      /usr/bin/curl -fsS "$DEFAULT_URL/gemini/status" || true
      /bin/echo
      /usr/bin/curl -fsS "$DEFAULT_URL/claude/status" || true
      /bin/echo
      /usr/bin/curl -fsS "$DEFAULT_URL/cursor/status" || true
      /bin/echo
      ;;
  esac
}

show_latest_audit() {
  local provider="${1:-}"
  local audit_dirs=()

  case "$provider" in
    codex)
      audit_dirs=(
        "$ROOT_DIR/.provider-gateway/codex-request-audit"
        "$ROOT_DIR/.provider-gateway/codex-oauth-audit"
        "$ROOT_DIR/.provider-gateway/provider-auth-lifecycle-audit"
      )
      ;;
    gemini)
      audit_dirs=(
        "$ROOT_DIR/.provider-gateway/gemini-request-audit"
        "$ROOT_DIR/.provider-gateway/provider-auth-lifecycle-audit"
      )
      ;;
    claude)
      audit_dirs=("$ROOT_DIR/.provider-gateway/claude-request-audit")
      ;;
    cursor)
      audit_dirs=("$ROOT_DIR/.provider-gateway/cursor-request-audit")
      ;;
    *)
      audit_dirs=(
        "$ROOT_DIR/.provider-gateway/provider-auth-lifecycle-audit"
        "$ROOT_DIR/.provider-gateway/codex-request-audit"
        "$ROOT_DIR/.provider-gateway/codex-oauth-audit"
        "$ROOT_DIR/.provider-gateway/gemini-request-audit"
        "$ROOT_DIR/.provider-gateway/claude-request-audit"
        "$ROOT_DIR/.provider-gateway/cursor-request-audit"
      )
      ;;
  esac

  local latest_file=""
  local candidate=""
  local audit_dir=""
  local files=()
  for audit_dir in "${audit_dirs[@]}"; do
    files=("$audit_dir"/*.json(N))
    if [[ ${#files[@]} -eq 0 ]]; then
      continue
    fi
    candidate="$(/bin/ls -t "${files[@]}" 2>/dev/null | /usr/bin/head -n 1 || true)"
    if [[ -n "$candidate" && ( -z "$latest_file" || "$candidate" -nt "$latest_file" ) ]]; then
      latest_file="$candidate"
    fi
  done

  if [[ -z "$latest_file" ]]; then
    /bin/echo "No encontré audit JSON para ${provider:-todos los providers}"
    exit 1
  fi

  /bin/echo "Audit: $latest_file"
  /bin/cat "$latest_file"
}

start_local_cli_auth_flow() {
  local provider="$1"

  /bin/echo "Iniciando auth local para $provider..."
  /bin/echo "Esto no abre OAuth web: arranca un flow CLI local y devuelve un flowId."
  /bin/echo

  local response
  response="$(/usr/bin/curl -fsS -X POST "$DEFAULT_URL/$provider/auth/start")"
  /bin/echo "$response"
  /bin/echo

  local flow_id
  flow_id="$(/bin/echo "$response" | /usr/bin/sed -n 's/.*"flowId":"\([^"]*\)".*/\1/p')"

  if [[ -n "$flow_id" ]]; then
    /bin/echo "Comandos útiles para completar el flow:"
    /bin/echo "  curl -N $DEFAULT_URL/$provider/auth/$flow_id/events"
    /bin/echo "  curl $DEFAULT_URL/$provider/auth/$flow_id"
    /bin/echo "  curl -X POST $DEFAULT_URL/$provider/auth/$flow_id/input \\"
    /bin/echo "    -H 'Content-Type: application/json' \\"
    /bin/echo "    -d '{\"value\":\"PEGÁ_ACÁ_EL_VALOR_QUE_PIDA_EL_CLI\"}'"
  else
    /bin/echo "No pude extraer flowId automáticamente. Usá el flowId del JSON anterior."
  fi
}

connect_provider() {
  local provider="$1"
  local path=""
  case "$provider" in
    codex) path="/codex/connect" ;;
    gemini) path="/gemini/connect" ;;
    claude|cursor) start_local_cli_auth_flow "$provider"; return 0 ;;
    *) /bin/echo "Provider no soportado: $provider"; exit 1 ;;
  esac

  /bin/echo "Abriendo auth para $provider..."
  open_url "$DEFAULT_URL$path"
  /bin/echo "Terminá el login en el navegador y después apretá ENTER."
  read -r
  show_status "$provider"
  show_latest_audit "$provider"
}

run_server() {
  ensure_env_file
  ensure_directories
  ensure_dependencies
  print_summary
  cd "$ROOT_DIR"
  /opt/homebrew/bin/npm run dev:standalone
}

init_only() {
  ensure_env_file
  ensure_directories
  ensure_dependencies
  print_summary
}

usage() {
  cat <<'EOF'
Uso:
  ./scripts/dev-bootstrap.sh init
  ./scripts/dev-bootstrap.sh up
  ./scripts/dev-bootstrap.sh codex
  ./scripts/dev-bootstrap.sh gemini
  ./scripts/dev-bootstrap.sh claude
  ./scripts/dev-bootstrap.sh cursor
  ./scripts/dev-bootstrap.sh status [codex|gemini|claude|cursor]
  ./scripts/dev-bootstrap.sh audit [codex|gemini|claude|cursor]

Qué hace:
  init    crea/completa .env para desarrollo local y directorios audit
  up      hace init y levanta el server standalone
  codex   abre auth Codex, espera ENTER, muestra status y último audit
  gemini  abre auth Gemini, espera ENTER, muestra status y último audit
  claude  inicia auth local Claude CLI y muestra comandos para completar flowId
  cursor  inicia auth local Cursor CLI y muestra comandos para completar flowId
  status  muestra status actual
  audit   muestra el último JSON audit
EOF
}

command="${1:-}"
case "$command" in
  init) init_only ;;
  up) run_server ;;
  codex) connect_provider "codex" ;;
  gemini) connect_provider "gemini" ;;
  claude) connect_provider "claude" ;;
  cursor) connect_provider "cursor" ;;
  status) show_status "${2:-}" ;;
  audit) show_latest_audit "${2:-}" ;;
  *) usage ;;
esac
