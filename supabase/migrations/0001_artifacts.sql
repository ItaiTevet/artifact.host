create extension if not exists "pgcrypto";

create table if not exists artifacts (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  content         text not null,
  title           text,
  visibility      text not null default 'public'
                  check (visibility in ('public','password')),
  password_hash   text,
  owner_id        uuid references auth.users(id) on delete set null,
  edit_token_hash text not null,
  deploy_ip_hash  text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  view_count      bigint not null default 0
);

create index if not exists artifacts_expires_at_idx on artifacts (expires_at);
create index if not exists artifacts_owner_id_idx   on artifacts (owner_id);
create index if not exists artifacts_ip_live_idx     on artifacts (deploy_ip_hash, expires_at);
