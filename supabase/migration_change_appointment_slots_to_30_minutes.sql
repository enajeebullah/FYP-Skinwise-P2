-- SkinWISE — change appointment slots from 15 to 30 minutes.
-- Run manually after migration_add_15_minute_appointment_slots.sql.
-- This migration never deletes or rewrites appointments.

-- Preflight active data before changing the database invariant. Resolve any
-- reported rows manually; historical completed/cancelled/rejected rows are
-- intentionally not changed.
do $$
declare
  invalid_details text;
begin
  select string_agg(
    format('doctor %s: appointment %s (%s %s)', doctor_id, id, appointment_date, appointment_time),
    E'\n'
  )
  into invalid_details
  from public.appointments
  where status in ('pending', 'confirmed')
    and (extract(minute from appointment_time)::integer % 30 <> 0
      or extract(second from appointment_time) <> 0);

  if invalid_details is not null then
    raise exception 'Active appointments exist outside 30-minute boundaries. Review manually before applying this migration.'
      using detail = invalid_details;
  end if;

  select string_agg(
    format('doctor %s: appointment %s overlaps appointment %s', a.doctor_id, a.id, b.id),
    E'\n'
  )
  into invalid_details
  from public.appointments a
  join public.appointments b
    on b.doctor_id = a.doctor_id
   and b.id > a.id
   and b.status in ('pending', 'confirmed')
  where a.status in ('pending', 'confirmed')
    and tsrange(a.appointment_date + a.appointment_time,
      a.appointment_date + a.appointment_time + interval '30 minutes', '[)')
      && tsrange(b.appointment_date + b.appointment_time,
        b.appointment_date + b.appointment_time + interval '30 minutes', '[)');

  if invalid_details is not null then
    raise exception 'Overlapping active appointments exist for 30-minute intervals. Review manually before applying this migration.'
      using detail = invalid_details;
  end if;
end;
$$;

alter table public.appointments
  drop constraint if exists appointments_no_overlapping_active_15_minute_slots;
drop trigger if exists enforce_15_minute_appointment_slots on public.appointments;
drop function if exists public.enforce_15_minute_appointment_slots();

create or replace function public.enforce_30_minute_appointment_slots()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doctor_record public.doctors%rowtype;
  normalized_hours text;
  hour_parts text[];
  range_start time;
  range_end time;
  pakistan_today date := (now() at time zone 'Asia/Karachi')::date;
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

  if new.appointment_date < pakistan_today
    or new.appointment_date > pakistan_today + 30
    or extract(minute from new.appointment_time)::integer % 30 <> 0
    or extract(second from new.appointment_time) <> 0
  then
    raise exception 'Appointments must be within 30 days and start on a 30-minute boundary.'
      using errcode = '22023';
  end if;

  select * into doctor_record from public.doctors where id = new.doctor_id and is_active;
  if not found then
    raise exception 'The selected dermatologist is not active.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from unnest(doctor_record.available_days) day_name
    where lower(left(trim(day_name), 3)) = lower(left(to_char(new.appointment_date, 'FMDay'), 3))
  ) then
    raise exception 'The dermatologist is not available on the selected day.' using errcode = '22023';
  end if;

  normalized_hours := regexp_replace(replace(replace(lower(trim(doctor_record.available_time)), '–', '-'), '—', '-'), '\s+to\s+', '-', 'g');
  hour_parts := regexp_split_to_array(normalized_hours, '\s*-\s*');
  if coalesce(array_length(hour_parts, 1), 0) <> 2 then
    raise exception 'The dermatologist availability hours are invalid.' using errcode = '22023';
  end if;

  begin
    range_start := case
      when hour_parts[1] ~ '^[0-9]{1,2}\s+(am|pm)$' then to_timestamp(trim(hour_parts[1]), 'HH12 AM')::time
      when hour_parts[1] ~ '(am|pm)' then to_timestamp(trim(hour_parts[1]), 'HH12:MI AM')::time
      else to_timestamp(trim(hour_parts[1]), 'HH24:MI')::time
    end;
    range_end := case
      when hour_parts[2] ~ '^[0-9]{1,2}\s+(am|pm)$' then to_timestamp(trim(hour_parts[2]), 'HH12 AM')::time
      when hour_parts[2] ~ '(am|pm)' then to_timestamp(trim(hour_parts[2]), 'HH12:MI AM')::time
      else to_timestamp(trim(hour_parts[2]), 'HH24:MI')::time
    end;
  exception when others then
    raise exception 'The dermatologist availability hours are invalid.' using errcode = '22023';
  end;

  if new.appointment_time < range_start or new.appointment_time + interval '30 minutes' > range_end then
    raise exception 'The selected appointment is outside the dermatologist working hours.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger enforce_30_minute_appointment_slots
  before insert or update of doctor_id, appointment_date, appointment_time, status
  on public.appointments
  for each row execute function public.enforce_30_minute_appointment_slots();

alter table public.appointments
  add constraint appointments_no_overlapping_active_30_minute_slots
  exclude using gist (
    doctor_id with =,
    tsrange(
      appointment_date + appointment_time,
      appointment_date + appointment_time + interval '30 minutes',
      '[)'
    ) with &&
  )
  where (status in ('pending', 'confirmed'));

create or replace function public.is_appointment_slot_available(
  p_doctor_id uuid,
  p_appointment_date date,
  p_appointment_time time
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = p_doctor_id
        and a.status in ('pending', 'confirmed')
        and tsrange(a.appointment_date + a.appointment_time,
          a.appointment_date + a.appointment_time + interval '30 minutes', '[)')
          && tsrange(p_appointment_date + p_appointment_time,
            p_appointment_date + p_appointment_time + interval '30 minutes', '[)')
    );
$$;

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
    and exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active)
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = p_doctor_id
        and a.status in ('pending', 'confirmed')
        and tsrange(a.appointment_date + a.appointment_time,
          a.appointment_date + a.appointment_time + interval '30 minutes', '[)')
          && tsrange(p_appointment_date + candidate.slot,
            p_appointment_date + candidate.slot + interval '30 minutes', '[)')
    );
$$;

revoke all on function public.is_appointment_slot_available(uuid, date, time) from public, anon;
grant execute on function public.is_appointment_slot_available(uuid, date, time) to authenticated;
revoke all on function public.get_available_appointment_slots(uuid, date, time[]) from public, anon;
grant execute on function public.get_available_appointment_slots(uuid, date, time[]) to authenticated;
