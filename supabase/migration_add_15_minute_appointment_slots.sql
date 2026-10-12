-- Fixed 15-minute appointment slots. Run after migration_add_consultations.sql.
-- Existing overlapping pending/confirmed appointments must be resolved before
-- this migration can add the exclusion constraint; no appointment data is deleted.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_no_overlapping_active_15_minute_slots'
  ) then
    raise exception 'Constraint appointments_no_overlapping_active_15_minute_slots already exists. Inspect its definition manually before continuing.';
  end if;
end;
$$;

do $$
declare
  overlap_details text;
begin
  select string_agg(
    format(
      'doctor %s: appointment %s (%s %s) overlaps appointment %s (%s %s)',
      overlap_rows.doctor_id,
      overlap_rows.id,
      overlap_rows.appointment_date,
      overlap_rows.appointment_time,
      overlap_rows.overlapping_id,
      overlap_rows.overlapping_date,
      overlap_rows.overlapping_time
    ),
    E'\n'
  )
  into overlap_details
  from (
    select
      a.doctor_id,
      a.id,
      a.appointment_date,
      a.appointment_time,
      b.id as overlapping_id,
      b.appointment_date as overlapping_date,
      b.appointment_time as overlapping_time
    from public.appointments a
    join public.appointments b
      on b.doctor_id = a.doctor_id
     and b.id > a.id
     and b.status in ('pending', 'confirmed')
    where a.status in ('pending', 'confirmed')
      and tsrange(
        a.appointment_date + a.appointment_time,
        a.appointment_date + a.appointment_time + interval '15 minutes',
        '[)'
      ) && tsrange(
        b.appointment_date + b.appointment_time,
        b.appointment_date + b.appointment_time + interval '15 minutes',
        '[)'
      )
  ) overlap_rows;

  if overlap_details is not null then
    raise exception 'Overlapping pending/confirmed appointment ranges exist. Resolve them before applying the 15-minute slot migration.'
      using detail = overlap_details;
  end if;
end;
$$;

create extension if not exists btree_gist;

create or replace function public.enforce_15_minute_appointment_slots()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status in ('pending', 'confirmed')
    and new.doctor_id is not distinct from old.doctor_id
    and new.appointment_date is not distinct from old.appointment_date
    and new.appointment_time is not distinct from old.appointment_time
  then
    return new;
  end if;

  if extract(minute from new.appointment_time)::integer % 15 <> 0
    or extract(second from new.appointment_time) <> 0
  then
    raise exception 'Appointment times must start on a 15-minute boundary.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_15_minute_appointment_slots on public.appointments;
create trigger enforce_15_minute_appointment_slots
  before insert or update of doctor_id, appointment_date, appointment_time, status
  on public.appointments
  for each row execute function public.enforce_15_minute_appointment_slots();

alter table public.appointments
  add constraint appointments_no_overlapping_active_15_minute_slots
  exclude using gist (
    doctor_id with =,
    tsrange(
      appointment_date + appointment_time,
      appointment_date + appointment_time + interval '15 minutes',
      '[)'
    ) with &&
  )
  where (status in ('pending', 'confirmed'));

create or replace function public.get_available_appointment_slots(
  p_doctor_id uuid,
  p_appointment_date date,
  p_candidate_times time[]
)
returns time[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(candidate.slot order by candidate.slot), array[]::time[])
  from unnest(coalesce(p_candidate_times, array[]::time[])) as candidate(slot)
  where auth.uid() is not null
    and exists (
      select 1
      from public.doctors d
      where d.id = p_doctor_id
        and d.is_active
    )
    and not exists (
      select 1
      from public.appointments a
      where a.doctor_id = p_doctor_id
        and a.status in ('pending', 'confirmed')
        and tsrange(
          a.appointment_date + a.appointment_time,
          a.appointment_date + a.appointment_time + interval '15 minutes',
          '[)'
        ) && tsrange(
          p_appointment_date + candidate.slot,
          p_appointment_date + candidate.slot + interval '15 minutes',
          '[)'
        )
    );
$$;

revoke all on function public.get_available_appointment_slots(uuid, date, time[]) from public, anon;
grant execute on function public.get_available_appointment_slots(uuid, date, time[]) to authenticated;
