-- Allow each authorized participant to hold a token claim for the same call
-- session. Keep at most one claim row per participant and session.
do $$
declare
  session_attnum smallint;
  actor_attnum smallint;
  session_only_constraint text;
  session_only_constraint_count integer;
  composite_constraint_count integer;
begin
  if pg_catalog.to_regclass('public.call_session_token_claims') is null then
    raise exception 'Expected public.call_session_token_claims to exist';
  end if;

  select a.attnum
    into session_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.call_session_token_claims'::regclass
    and a.attname = 'session_id'
    and not a.attisdropped;

  select a.attnum
    into actor_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.call_session_token_claims'::regclass
    and a.attname = 'actor_user_id'
    and not a.attisdropped;

  if session_attnum is null or actor_attnum is null then
    raise exception 'Expected session_id and actor_user_id columns on public.call_session_token_claims';
  end if;

  select count(*)
    into session_only_constraint_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.call_session_token_claims'::regclass
    and c.contype = 'u'
    and c.conkey::smallint[] = array[session_attnum]::smallint[];

  select count(*)
    into composite_constraint_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.call_session_token_claims'::regclass
    and c.contype = 'u'
    and c.conkey::smallint[] = array[session_attnum, actor_attnum]::smallint[];

  if session_only_constraint_count > 1 then
    raise exception 'Found multiple session_id-only unique constraints; inspect public.call_session_token_claims before migrating';
  end if;

  if session_only_constraint_count = 1 then
    select c.conname
      into session_only_constraint
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.call_session_token_claims'::regclass
      and c.contype = 'u'
      and c.conkey::smallint[] = array[session_attnum]::smallint[];

    execute pg_catalog.format(
      'alter table public.call_session_token_claims drop constraint %I',
      session_only_constraint
    );
  elsif composite_constraint_count = 0 then
    raise exception 'Expected the repository session_id-only unique constraint or an existing (session_id, actor_user_id) unique constraint; inspect public.call_session_token_claims before migrating';
  end if;

  if composite_constraint_count = 0 then
    alter table public.call_session_token_claims
      add constraint call_session_token_claims_session_actor_key
      unique (session_id, actor_user_id);
  end if;
end;
$$;

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
  existing_claim record;
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

  -- Match the lifecycle lock order: appointment, doctor, then session.
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

  -- Appointment and session locks serialize claim creation for this call.
  -- Reuse only this actor's active claim; the other participant has a separate
  -- row under the composite unique constraint.
  select c.claim_id, c.expires_at
    into existing_claim
  from public.call_session_token_claims c
  where c.session_id = p_session_id
    and c.actor_user_id = p_actor_user_id
    and c.expires_at > pg_catalog.clock_timestamp()
  for update;

  if found then
    return query
    select existing_claim.claim_id, session_row.room_name,
           session_row.call_status, session_row.expires_at,
           session_row.room_expires_at, existing_claim.expires_at;
    return;
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
