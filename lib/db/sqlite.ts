import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Portable schema for the self-host (SQLite) driver. Mirrors the Supabase Postgres tables
 * but without the Supabase-isms (no auth.users FK, no service_role grants). Timestamps are
 * stored as ISO-8601 UTC strings, which sort lexicographically == chronologically.
 */
export const SQLITE_SCHEMA = `
create table if not exists artifacts (
  id              text primary key,
  slug            text unique not null,
  content         text not null,
  title           text,
  visibility      text not null default 'public',
  password_hash   text,
  owner_id        text,
  edit_token_hash text not null,
  deploy_ip_hash  text,
  share_allowlist text,
  created_at      text not null,
  expires_at      text not null,
  view_count      integer not null default 0,
  comments_enabled integer not null default 0
);
create index if not exists artifacts_expires_at_idx on artifacts (expires_at);
create index if not exists artifacts_owner_id_idx   on artifacts (owner_id);
create index if not exists artifacts_ip_live_idx    on artifacts (deploy_ip_hash, expires_at);

create table if not exists api_tokens (
  id           text primary key,
  owner_id     text not null,
  name         text not null,
  token_hash   text not null unique,
  created_at   text not null,
  last_used_at text,
  expires_at   text
);
create index if not exists api_tokens_owner_id_idx on api_tokens (owner_id);

create table if not exists users (
  id            text primary key,
  email         text unique not null,
  password_hash text not null,
  created_at    text not null
);

create table if not exists auth_attempts (
  ip_hash    text not null,
  created_at text not null
);
create index if not exists auth_attempts_ip_time_idx on auth_attempts (ip_hash, created_at);

create table if not exists comments (
  id            text primary key,
  artifact_slug text not null references artifacts(slug) on delete cascade,
  author_id     text not null,
  author_email  text,
  body          text not null,
  anchor        text not null,
  resolved      integer not null default 0,
  created_at    text not null
);
create index if not exists comments_artifact_slug_idx on comments (artifact_slug);
`;

export function applySchema(db: Database.Database): void {
  db.exec(SQLITE_SCHEMA);
  // Idempotent upgrade for DBs created before the column existed (SQLite lacks ADD COLUMN IF NOT EXISTS).
  try { db.exec('alter table artifacts add column share_allowlist text'); } catch { /* already present */ }
  try { db.exec('alter table artifacts add column comments_enabled integer not null default 0'); } catch { /* already present */ }
}

let db: Database.Database | null = null;

/** Process-wide SQLite handle for the self-host driver (WAL mode, schema bootstrapped). */
export function getSqliteDb(): Database.Database {
  if (db) return db;
  const path = process.env.SQLITE_PATH || './data/artifacts.db';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}
