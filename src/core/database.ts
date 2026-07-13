import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";

export type ProviderGatewayDrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type ProviderGatewayDatabaseContext = {
  db: ProviderGatewayDrizzleDb;
  sqlite: Database.Database;
  migrate: () => void;
};

function toSqlitePath(databaseUrl: string) {
  return databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string) {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function readInitialMigrationSql() {
  const currentFile = fileURLToPath(import.meta.url);
  const migrationFile = path.resolve(path.dirname(currentFile), "../db/migrations/0000_initial.sql");
  return fs.readFileSync(migrationFile, "utf8");
}

export function createProviderGatewayDatabaseContext(options: {
  databaseUrl?: string;
  sqlite?: Database.Database;
}): ProviderGatewayDatabaseContext {
  const sqlite = options.sqlite ?? new Database(toSqlitePath(options.databaseUrl ?? "file:./provider_gateway.db"));
  const db = drizzle(sqlite, { schema });
  let migrated = false;

  return {
    db,
    sqlite,
    migrate: () => {
      if (migrated) return;
      sqlite.exec(readInitialMigrationSql());
      if (!hasColumn(sqlite, "providers", "pricing_json")) {
        sqlite.exec("ALTER TABLE providers ADD COLUMN pricing_json TEXT;");
      }
      if (!hasColumn(sqlite, "provider_credentials", "metadata_json")) {
        sqlite.exec("ALTER TABLE provider_credentials ADD COLUMN metadata_json TEXT;");
      }
      if (!hasColumn(sqlite, "provider_credentials", "encrypted_refresh_token")) {
        sqlite.exec("ALTER TABLE provider_credentials ADD COLUMN encrypted_refresh_token TEXT;");
      }
      if (!hasColumn(sqlite, "provider_credentials", "encrypted_id_token")) {
        sqlite.exec("ALTER TABLE provider_credentials ADD COLUMN encrypted_id_token TEXT;");
      }
      if (!hasColumn(sqlite, "provider_credentials", "last_refresh_at")) {
        sqlite.exec("ALTER TABLE provider_credentials ADD COLUMN last_refresh_at TEXT;");
      }
      if (!hasColumn(sqlite, "provider_oauth_sessions", "provider_type")) {
        sqlite.exec("ALTER TABLE provider_oauth_sessions ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'codex';");
      }
      sqlite.exec(`CREATE TABLE IF NOT EXISTS provider_connections (
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
      );`);
      migrated = true;
    },
  };
}
