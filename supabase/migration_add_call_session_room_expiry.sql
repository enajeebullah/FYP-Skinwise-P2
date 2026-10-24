-- Separate the unanswered invitation deadline from the Daily consultation
-- room deadline without changing existing call-session statuses or rows.
alter table public.call_sessions
  add column if not exists room_expires_at timestamptz;

comment on column public.call_sessions.expires_at is
  'Deadline for an unanswered ringing invitation.';

comment on column public.call_sessions.room_expires_at is
  'Deadline for the Daily consultation room.';
