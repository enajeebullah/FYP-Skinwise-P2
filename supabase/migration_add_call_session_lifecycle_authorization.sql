-- Atomically authorize and transition a call session while locking the
-- appointment and call-session rows. This is callable only by the trusted
-- server-side service role; authenticated clients retain read-only access.
create or replace function public.transition_call_session(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_target_status text
)
returns table (
  id uuid,
  appointment_id uuid,
  caller_user_id uuid,
  recipient_user_id uuid,
  room_name text,
  call_status text,
  expires_at timestamptz,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  session_row record;
begin
  if p_target_status not in ('accepted', 'rejected', 'missed') then
    raise exception using errcode = 'P0001', message = 'invalid_call_transition';
  end if;

  select
    cs.id,
    cs.appointment_id,
    cs.caller_user_id,
    cs.recipient_user_id,
    cs.room_name,
    cs.call_status,
    cs.expires_at,
    cs.room_expires_at,
    a.patient_id,
    d.user_id as doctor_user_id
  into session_row
  from public.call_sessions cs
  join public.appointments a on a.id = cs.appointment_id
  join public.doctors d on d.id = a.doctor_id
  where cs.id = p_session_id
    and a.status = 'confirmed'
  for update of cs, a;

  if not found then
    raise exception using errcode = 'P0001', message = 'call_session_not_available';
  end if;

  if p_actor_user_id is null
     or (p_actor_user_id <> session_row.patient_id
         and p_actor_user_id <> session_row.doctor_user_id)
     or session_row.caller_user_id not in (session_row.patient_id, session_row.doctor_user_id)
     or session_row.recipient_user_id not in (session_row.patient_id, session_row.doctor_user_id)
     or session_row.caller_user_id = session_row.recipient_user_id
  then
    raise exception using errcode = 'P0001', message = 'call_session_not_available';
  end if;

  if p_target_status in ('accepted', 'rejected')
     and p_actor_user_id <> session_row.recipient_user_id
  then
    raise exception using errcode = 'P0001', message = 'recipient_only_transition';
  end if;

  if p_target_status = 'accepted' then
    if session_row.call_status in ('accepted', 'active') then
      null;
    elsif session_row.call_status = 'ringing'
      and session_row.expires_at > now()
      and session_row.room_expires_at > now()
    then
      update public.call_sessions
      set call_status = 'accepted'
      where call_sessions.id = session_row.id;
    else
      raise exception using errcode = 'P0001', message = 'call_invitation_expired_or_invalid';
    end if;
  elsif p_target_status = 'rejected' then
    if session_row.call_status = 'rejected' then
      null;
    elsif session_row.call_status = 'ringing'
      and session_row.expires_at > now()
    then
      update public.call_sessions
      set call_status = 'rejected'
      where call_sessions.id = session_row.id;
    else
      raise exception using errcode = 'P0001', message = 'call_invitation_expired_or_invalid';
    end if;
  elsif session_row.call_status = 'ringing'
    and session_row.expires_at <= now()
  then
    update public.call_sessions
    set call_status = 'missed'
    where call_sessions.id = session_row.id;
  else
    raise exception using errcode = 'P0001', message = 'call_invitation_not_expired';
  end if;

  return query
  select
    cs.id,
    cs.appointment_id,
    cs.caller_user_id,
    cs.recipient_user_id,
    cs.room_name,
    cs.call_status,
    cs.expires_at,
    cs.room_expires_at
  from public.call_sessions cs
  where cs.id = session_row.id;
end;
$$;

alter function public.transition_call_session(uuid, uuid, text) owner to postgres;
revoke all on function public.transition_call_session(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_call_session(uuid, uuid, text)
  to service_role;

-- Authorize a join lookup against the current appointment relationship. The
-- caller is still responsible for authenticating the user before invoking it.
create or replace function public.get_authorized_call_session(
  p_session_id uuid,
  p_actor_user_id uuid
)
returns table (
  id uuid,
  appointment_id uuid,
  caller_user_id uuid,
  recipient_user_id uuid,
  room_name text,
  call_status text,
  expires_at timestamptz,
  room_expires_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    cs.id,
    cs.appointment_id,
    cs.caller_user_id,
    cs.recipient_user_id,
    cs.room_name,
    cs.call_status,
    cs.expires_at,
    cs.room_expires_at
  from public.call_sessions cs
  join public.appointments a on a.id = cs.appointment_id
  join public.doctors d on d.id = a.doctor_id
  where cs.id = p_session_id
    and a.status = 'confirmed'
    and p_actor_user_id in (a.patient_id, d.user_id)
    and (
      (cs.caller_user_id = a.patient_id and cs.recipient_user_id = d.user_id)
      or (cs.caller_user_id = d.user_id and cs.recipient_user_id = a.patient_id)
    );
$$;

alter function public.get_authorized_call_session(uuid, uuid) owner to postgres;
revoke all on function public.get_authorized_call_session(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_authorized_call_session(uuid, uuid)
  to service_role;
