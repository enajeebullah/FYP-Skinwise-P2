-- Keep appointment/session authorization stable for the lifetime of a short
-- Daily join token. Appointment and session mutations are rejected while a
-- valid token lease exists; expired leases require no cleanup job.

create table public.call_session_token_claims (
  claim_id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique
    references public.call_sessions (id) on delete cascade,
  appointment_id uuid not null
    references public.appointments (id) on delete cascade,
  actor_user_id uuid not null
    references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.call_session_token_claims enable row level security;
revoke all on public.call_session_token_claims from public, anon, authenticated, service_role;
alter table public.call_session_token_claims owner to postgres;

-- Call creation remains a trusted server-side insert; lifecycle writes go
-- through the SECURITY DEFINER transition function below.
revoke update, delete on public.call_sessions from public, anon, authenticated, service_role;
grant select, insert on public.call_sessions to service_role;

create or replace function public.guard_call_session_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  appointment_patient_id uuid;
  appointment_doctor_id uuid;
  assigned_doctor_user_id uuid;
  appointment_status text;
begin
  select a.patient_id, a.doctor_id, a.status
    into appointment_patient_id, appointment_doctor_id, appointment_status
  from public.appointments a
  where a.id = new.appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'call_session_not_available';
  end if;

  select d.user_id
    into assigned_doctor_user_id
  from public.doctors d
  where d.id = appointment_doctor_id
  for update;

  if not found
     or appointment_status <> 'confirmed'
     or assigned_doctor_user_id is null
     or new.caller_user_id not in (appointment_patient_id, assigned_doctor_user_id)
     or new.recipient_user_id not in (appointment_patient_id, assigned_doctor_user_id)
     or new.caller_user_id = new.recipient_user_id
  then
    raise exception using errcode = 'P0001', message = 'call_session_not_available';
  end if;

  return new;
end;
$$;

alter function public.guard_call_session_insert() owner to postgres;
revoke all on function public.guard_call_session_insert() from public, anon, authenticated, service_role;

drop trigger if exists guard_call_session_insert on public.call_sessions;
create trigger guard_call_session_insert
  before insert on public.call_sessions
  for each row execute function public.guard_call_session_insert();

create or replace function public.guard_call_token_claim_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_appointment_id uuid;
  target_session_id uuid;
begin
  if tg_table_name = 'appointments' then
    target_appointment_id := old.id;
  elsif tg_table_name = 'doctors' then
    if new.user_id is not distinct from old.user_id then
      return new;
    end if;
    if exists (
      select 1
      from public.call_session_token_claims c
      join public.appointments a on a.id = c.appointment_id
      where a.doctor_id = old.id
        and c.expires_at > pg_catalog.clock_timestamp()
    ) then
      raise exception using errcode = '55P03', message = 'call_token_claim_active';
    end if;
    return new;
  else
    target_session_id := old.id;
    if tg_op = 'UPDATE'
       and new.appointment_id = old.appointment_id
       and new.caller_user_id = old.caller_user_id
       and new.recipient_user_id = old.recipient_user_id
       and new.room_name = old.room_name
       and new.expires_at = old.expires_at
       and new.room_expires_at is not distinct from old.room_expires_at
       and (
         (old.call_status = 'ringing' and new.call_status = 'accepted')
         or (
           old.call_status = 'accepted' and new.call_status = 'active'
         )
         or (
           old.call_status in ('accepted', 'active')
           and new.call_status = 'ended'
         )
         or (
           old.call_status = 'ringing' and new.call_status = 'ended'
         )
       )
    then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.call_session_token_claims c
    where c.expires_at > pg_catalog.clock_timestamp()
      and (
        (target_appointment_id is not null and c.appointment_id = target_appointment_id)
        or (target_session_id is not null and c.session_id = target_session_id)
      )
  ) then
    raise exception using errcode = '55P03', message = 'call_token_claim_active';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_call_token_claim_mutation() owner to postgres;
revoke all on function public.guard_call_token_claim_mutation() from public, anon, authenticated, service_role;

drop trigger if exists guard_call_token_claim_appointment_update on public.appointments;
create trigger guard_call_token_claim_appointment_update
  before update of patient_id, doctor_id, status on public.appointments
  for each row execute function public.guard_call_token_claim_mutation();

drop trigger if exists guard_call_token_claim_appointment_delete on public.appointments;
create trigger guard_call_token_claim_appointment_delete
  before delete on public.appointments
  for each row execute function public.guard_call_token_claim_mutation();

drop trigger if exists guard_call_token_claim_doctor_update on public.doctors;
create trigger guard_call_token_claim_doctor_update
  before update of user_id on public.doctors
  for each row execute function public.guard_call_token_claim_mutation();

drop trigger if exists guard_call_token_claim_session_change on public.call_sessions;
create trigger guard_call_token_claim_session_change
  before update or delete on public.call_sessions
  for each row execute function public.guard_call_token_claim_mutation();

create or replace function public.create_call_session_token_claim(
  p_session_id uuid,
  p_actor_user_id uuid
)
returns table (
  claim_id uuid,
  room_name text,
  call_status text,
  invitation_expires_at timestamptz,
  room_expires_at timestamptz,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  appointment_id_value uuid;
  patient_id_value uuid;
  doctor_id_value uuid;
  appointment_status_value text;
  doctor_user_id_value uuid;
  session_row record;
  new_claim_id uuid;
  new_claim_expiry timestamptz;
begin
  select cs.appointment_id
    into appointment_id_value
  from public.call_sessions cs
  where cs.id = p_session_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'call_token_not_authorized';
  end if;

  -- All claim and lifecycle operations lock appointment, doctor, then session.
  select a.patient_id, a.doctor_id, a.status
    into patient_id_value, doctor_id_value, appointment_status_value
  from public.appointments a
  where a.id = appointment_id_value
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'call_token_not_authorized';
  end if;

  select d.user_id
    into doctor_user_id_value
  from public.doctors d
  where d.id = doctor_id_value
  for update;

  select cs.id, cs.appointment_id, cs.caller_user_id, cs.recipient_user_id,
         cs.room_name, cs.call_status, cs.expires_at, cs.room_expires_at
    into session_row
  from public.call_sessions cs
  where cs.id = p_session_id
    and cs.appointment_id = appointment_id_value
  for update;

  if not found
     or appointment_status_value <> 'confirmed'
     or doctor_user_id_value is null
     or p_actor_user_id is null
     or (p_actor_user_id <> patient_id_value and p_actor_user_id <> doctor_user_id_value)
     or session_row.caller_user_id not in (patient_id_value, doctor_user_id_value)
     or session_row.recipient_user_id not in (patient_id_value, doctor_user_id_value)
     or session_row.caller_user_id = session_row.recipient_user_id
     or p_actor_user_id not in (session_row.caller_user_id, session_row.recipient_user_id)
     or not (
       session_row.call_status in ('accepted', 'active')
       or (
         session_row.call_status = 'ringing'
         and p_actor_user_id = session_row.caller_user_id
         and session_row.expires_at > pg_catalog.clock_timestamp()
       )
     )
     or session_row.room_expires_at is null
     or session_row.room_expires_at <= pg_catalog.clock_timestamp()
  then
    raise exception using errcode = 'P0001', message = 'call_token_not_authorized';
  end if;

  delete from public.call_session_token_claims c
  where c.session_id = p_session_id
    and c.expires_at <= pg_catalog.clock_timestamp();

  if exists (
    select 1
    from public.call_session_token_claims c
    where c.session_id = p_session_id
      and c.expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'call_token_claim_active';
  end if;

  new_claim_id := pg_catalog.gen_random_uuid();
  new_claim_expiry := least(
    session_row.room_expires_at,
    pg_catalog.clock_timestamp() + interval '2 minutes',
    case when session_row.call_status = 'ringing'
      then session_row.expires_at
      else session_row.room_expires_at
    end
  );

  insert into public.call_session_token_claims (
    claim_id, session_id, appointment_id, actor_user_id, expires_at
  ) values (
    new_claim_id, session_row.id, appointment_id_value, p_actor_user_id, new_claim_expiry
  );

  return query select new_claim_id, session_row.room_name,
                      session_row.call_status, session_row.expires_at,
                      session_row.room_expires_at, new_claim_expiry;
end;
$$;

alter function public.create_call_session_token_claim(uuid, uuid) owner to postgres;
revoke all on function public.create_call_session_token_claim(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_call_session_token_claim(uuid, uuid)
  to service_role;

create or replace function public.validate_call_session_token_claim(
  p_session_id uuid,
  p_claim_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  appointment_id_value uuid;
  patient_id_value uuid;
  doctor_id_value uuid;
  appointment_status_value text;
  doctor_user_id_value uuid;
  session_row record;
  claim_expiry timestamptz;
begin
  select cs.appointment_id
    into appointment_id_value
  from public.call_sessions cs
  where cs.id = p_session_id;

  if not found then return false; end if;

  select a.patient_id, a.doctor_id, a.status
    into patient_id_value, doctor_id_value, appointment_status_value
  from public.appointments a
  where a.id = appointment_id_value
  for update;

  if not found then return false; end if;

  select d.user_id
    into doctor_user_id_value
  from public.doctors d
  where d.id = doctor_id_value
  for update;

  select cs.id, cs.appointment_id, cs.caller_user_id, cs.recipient_user_id,
         cs.call_status, cs.expires_at, cs.room_expires_at
    into session_row
  from public.call_sessions cs
  where cs.id = p_session_id
    and cs.appointment_id = appointment_id_value
  for update;

  if not found then return false; end if;

  select c.expires_at
    into claim_expiry
  from public.call_session_token_claims c
  where c.claim_id = p_claim_id
    and c.session_id = p_session_id
    and c.appointment_id = appointment_id_value
    and c.actor_user_id = p_actor_user_id;

  return found
    and claim_expiry > pg_catalog.clock_timestamp()
    and appointment_status_value = 'confirmed'
    and doctor_user_id_value is not null
    and p_actor_user_id in (patient_id_value, doctor_user_id_value)
    and p_actor_user_id in (session_row.caller_user_id, session_row.recipient_user_id)
    and session_row.caller_user_id in (patient_id_value, doctor_user_id_value)
    and session_row.recipient_user_id in (patient_id_value, doctor_user_id_value)
    and session_row.caller_user_id <> session_row.recipient_user_id
    and (
      session_row.call_status in ('accepted', 'active')
      or (
        session_row.call_status = 'ringing'
        and p_actor_user_id = session_row.caller_user_id
        and session_row.expires_at > pg_catalog.clock_timestamp()
      )
    )
    and session_row.room_expires_at > pg_catalog.clock_timestamp();
end;
$$;

alter function public.validate_call_session_token_claim(uuid, uuid, uuid) owner to postgres;
revoke all on function public.validate_call_session_token_claim(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.validate_call_session_token_claim(uuid, uuid, uuid)
  to service_role;

-- Replace the prior transition function with the same allowed transitions but
-- an explicit appointment -> doctor -> session lock order used by token claims.
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
  appointment_id_value uuid;
  patient_id_value uuid;
  doctor_id_value uuid;
  appointment_status_value text;
  doctor_user_id_value uuid;
  session_row record;
begin
  if p_target_status not in ('accepted', 'active', 'rejected', 'missed', 'ended') then
    raise exception using errcode = 'P0001', message = 'invalid_call_transition';
  end if;

  select cs.appointment_id into appointment_id_value
  from public.call_sessions cs where cs.id = p_session_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'call_session_not_available';
  end if;

  select a.patient_id, a.doctor_id, a.status
    into patient_id_value, doctor_id_value, appointment_status_value
  from public.appointments a where a.id = appointment_id_value for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'call_session_not_available';
  end if;

  select d.user_id into doctor_user_id_value
  from public.doctors d where d.id = doctor_id_value for update;

  select cs.id, cs.appointment_id, cs.caller_user_id, cs.recipient_user_id,
         cs.room_name, cs.call_status, cs.expires_at, cs.room_expires_at
    into session_row
  from public.call_sessions cs
  where cs.id = p_session_id and cs.appointment_id = appointment_id_value
  for update;

  if not found or appointment_status_value <> 'confirmed'
     or doctor_user_id_value is null
     or p_actor_user_id is null
     or (p_actor_user_id <> patient_id_value and p_actor_user_id <> doctor_user_id_value)
     or session_row.caller_user_id not in (patient_id_value, doctor_user_id_value)
     or session_row.recipient_user_id not in (patient_id_value, doctor_user_id_value)
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
      and session_row.expires_at > pg_catalog.clock_timestamp()
      and session_row.room_expires_at > pg_catalog.clock_timestamp()
    then
      update public.call_sessions set call_status = 'accepted'
      where call_sessions.id = session_row.id;
    else
      raise exception using errcode = 'P0001', message = 'call_invitation_expired_or_invalid';
    end if;
  elsif p_target_status = 'rejected' then
    if session_row.call_status = 'rejected' then
      null;
    elsif session_row.call_status = 'ringing'
      and session_row.expires_at > pg_catalog.clock_timestamp()
    then
      update public.call_sessions set call_status = 'rejected'
      where call_sessions.id = session_row.id;
    else
      raise exception using errcode = 'P0001', message = 'call_invitation_expired_or_invalid';
    end if;
  elsif p_target_status = 'active' then
    if session_row.call_status = 'accepted' then
      update public.call_sessions set call_status = 'active'
      where call_sessions.id = session_row.id;
    elsif session_row.call_status <> 'active' then
      raise exception using errcode = 'P0001', message = 'call_session_not_available';
    end if;
  elsif p_target_status = 'missed'
    and session_row.call_status = 'ringing'
    and session_row.expires_at <= pg_catalog.clock_timestamp()
  then
    update public.call_sessions set call_status = 'missed'
    where call_sessions.id = session_row.id;
  elsif p_target_status = 'ended' then
    if session_row.call_status in ('accepted', 'active')
       or (session_row.call_status = 'ringing' and p_actor_user_id = session_row.caller_user_id)
    then
      update public.call_sessions set call_status = 'ended'
      where call_sessions.id = session_row.id;
    elsif session_row.call_status <> 'ended' then
      raise exception using errcode = 'P0001', message = 'call_session_not_available';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'call_invitation_not_expired';
  end if;

  return query
  select cs.id, cs.appointment_id, cs.caller_user_id, cs.recipient_user_id,
         cs.room_name, cs.call_status, cs.expires_at, cs.room_expires_at
  from public.call_sessions cs where cs.id = session_row.id;
end;
$$;

alter function public.transition_call_session(uuid, uuid, text) owner to postgres;
revoke all on function public.transition_call_session(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_call_session(uuid, uuid, text)
  to service_role;
