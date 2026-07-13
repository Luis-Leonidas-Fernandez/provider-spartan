CREATE TABLE IF NOT EXISTS app_clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  api_key_hash TEXT NOT NULL,
  api_key_prefix TEXT NOT NULL UNIQUE,
  api_key_last_four TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  monthly_request_limit INTEGER NOT NULL,
  monthly_token_limit INTEGER NOT NULL,
  monthly_budget_usd REAL NOT NULL,
  allowed_providers_json TEXT NOT NULL,
  allowed_models_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  app_client_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  access_mode TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  supports_usage_reporting INTEGER NOT NULL DEFAULT 0,
  supports_streaming INTEGER NOT NULL DEFAULT 0,
  pricing_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_health (
  provider_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  latency_ms INTEGER
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL UNIQUE,
  credential_type TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  encrypted_id_token TEXT,
  masked_value TEXT NOT NULL,
  metadata_json TEXT,
  token_expires_at TEXT,
  last_refresh_at TEXT,
  refresh_token_exists INTEGER NOT NULL DEFAULT 0,
  login_status TEXT NOT NULL,
  last_auth_check_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_oauth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'codex',
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  encrypted_id_token TEXT,
  scopes_json TEXT,
  metadata_json TEXT,
  token_expires_at TEXT,
  last_refresh_at TEXT,
  last_auth_check_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  app_client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  usage_source TEXT NOT NULL,
  estimated_cost_usd REAL,
  final_cost_usd REAL,
  pricing_snapshot_json TEXT,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  app_client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  request_metadata_json TEXT NOT NULL,
  response_metadata_json TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL
);
