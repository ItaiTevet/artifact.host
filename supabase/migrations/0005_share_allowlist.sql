-- Per-artifact sharing allowlist (JSON array of {value,type}) for visibility = 'restricted'.
alter table artifacts add column if not exists share_allowlist text;

-- Allow the new 'restricted' visibility (the original check only permitted public/password).
alter table artifacts drop constraint if exists artifacts_visibility_check;
alter table artifacts add constraint artifacts_visibility_check
  check (visibility in ('public', 'password', 'restricted'));
