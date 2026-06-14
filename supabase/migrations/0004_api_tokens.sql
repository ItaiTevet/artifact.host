-- Personal API tokens: long-lived owner credentials for the CLI / REST API.
-- A token's plaintext is shown once at creation; only its SHA-256 hash is stored.
create table if not exists api_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz
);

create index if not exists api_tokens_owner_id_idx   on api_tokens (owner_id);
create index if not exists api_tokens_token_hash_idx on api_tokens (token_hash);

grant all on table public.api_tokens to service_role;
