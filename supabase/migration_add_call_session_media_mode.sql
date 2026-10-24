-- Persist whether an appointment call starts with video enabled or disabled.
-- Apply after migration_add_call_sessions.sql.
alter table public.call_sessions
  add column if not exists call_mode text not null default 'video'
  check (call_mode in ('audio', 'video'));
