-- Per-artifact sharing allowlist (JSON array of {value,type}) for visibility = 'restricted'.
alter table artifacts add column if not exists share_allowlist text;
