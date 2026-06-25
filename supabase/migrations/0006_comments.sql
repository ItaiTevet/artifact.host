-- Per-artifact master switch for commenting (gates the annotation layer + comment endpoints).
alter table artifacts add column if not exists comments_enabled boolean not null default false;

-- Comments / annotations on an artifact. anchor is a JSON blob ({kind:'pin'|'highlight', x,y, quote?}).
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

grant all on table comments to service_role;
