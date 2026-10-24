-- Audio/video call session metadata for confirmed appointments.
-- Call-session rows are provisioned by a trusted server-side process. The
-- authenticated client role can only read an existing session when it is one
-- of the two appointment participants.

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null
    references public.appointments (id) on delete cascade,
  caller_user_id uuid not null
    references auth.users (id) on delete cascade,
  recipient_user_id uuid not null
    references auth.users (id) on delete cascade,
  room_name text not null unique
    check (char_length(btrim(room_name)) > 0),
  call_status text not null default 'ringing'
    check (call_status in (
      'ringing',
      'accepted',
      'active',
      'rejected',
      'missed',
      'ended',
      'failed'
    )),
  expires_at timestamptz not null,
  constraint call_sessions_distinct_participants
    check (caller_user_id <> recipient_user_id)
);

create unique index if not exists call_sessions_one_live_per_appointment_idx
  on public.call_sessions (appointment_id)
  where call_status in ('ringing', 'accepted', 'active');

alter table public.call_sessions enable row level security;

revoke all on public.call_sessions from public, anon, authenticated;
grant select on public.call_sessions to authenticated;

drop policy if exists "Confirmed appointment participants can view call sessions"
  on public.call_sessions;
create policy "Confirmed appointment participants can view call sessions"
  on public.call_sessions for select
  to authenticated
  using (
    exists (
      select 1
      from public.appointments a
      join public.doctors d on d.id = a.doctor_id
      where a.id = call_sessions.appointment_id
        and a.status = 'confirmed'
        and (
          (
            call_sessions.caller_user_id = a.patient_id
            and call_sessions.recipient_user_id = d.user_id
          )
          or (
            call_sessions.caller_user_id = d.user_id
            and call_sessions.recipient_user_id = a.patient_id
          )
        )
        and (
          auth.uid() = a.patient_id
          or auth.uid() = d.user_id
        )
    )
  );
