import { Pool } from 'pg';

/**
 * Portable Postgres schema for the self-host `postgres` driver (DATABASE_URL). Mirrors the
 * SQLite/Supabase tables but with no Supabase-isms (no auth.users FK, no service_role grants).
 * owner_id is plain text so it can hold either a local user id or an external subject.
 */
export const POSTGRES_SCHEMA = `
create extension if not exists pgcrypto;

create table if not exists artifacts (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  content         text not null,
  title           text,
  visibility      text not null default 'public',
  password_hash   text,
  owner_id        text,
  edit_token_hash text not null,
  deploy_ip_hash  text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  view_count      bigint not null default 0
);
create index if not exists artifacts_expires_at_idx on artifacts (expires_at);
create index if not exists artifacts_owner_id_idx   on artifacts (owner_id);
create index if not exists artifacts_ip_live_idx    on artifacts (deploy_ip_hash, expires_at);

create table if not exists api_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,
  name         text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz
);
create index if not exists api_tokens_owner_id_idx on api_tokens (owner_id);

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
`;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPgPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for DB_DRIVER=postgres');
  pool = new Pool({ connectionString });
  return pool;
}

/** Returns a pool with the schema bootstrapped once (idempotent). */
export async function ensurePgSchema(): Promise<Pool> {
  const p = getPgPool();
  if (!schemaReady) schemaReady = p.query(POSTGRES_SCHEMA).then(() => undefined);
  await schemaReady;
  return p;
}
