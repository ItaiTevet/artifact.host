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
  share_allowlist text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  view_count      bigint not null default 0,
  comments_enabled boolean not null default false
);
alter table artifacts add column if not exists share_allowlist text;
alter table artifacts add column if not exists comments_enabled boolean not null default false;
-- Revert plaintext deployer IPs back to hashed storage: rename a plaintext deploy_ip column
-- (from the short-lived plaintext build) back to deploy_ip_hash, then scrub any raw IPs left
-- behind (a real SHA-256 hash is always 64 hex chars). Runs once; no-op once already reverted.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'artifacts' and column_name = 'deploy_ip') then
    alter table artifacts rename column deploy_ip to deploy_ip_hash;
    update artifacts set deploy_ip_hash = null where deploy_ip_hash is not null and char_length(deploy_ip_hash) <> 64;
  end if;
end $$;
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

create table if not exists auth_attempts (
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_ip_time_idx on auth_attempts (ip_hash, created_at);

create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  artifact_slug text not null references artifacts(slug) on delete cascade,
  author_id     text not null,
  author_email  text,
  body          text not null,
  anchor        text not null,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists comments_artifact_slug_idx on comments (artifact_slug);
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
