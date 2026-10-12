-- Allow patients to cancel only their own future pending/confirmed appointments.
-- Apply manually after reviewing; this migration is not run by the application.

drop policy if exists "Patients can cancel their own future appointments" on public.appointments;
create policy "Patients can cancel their own future appointments"
  on public.appointments for update
  to authenticated
  using (
    patient_id = auth.uid()
    and status in ('pending', 'confirmed')
    and (appointment_date + appointment_time) > (now() at time zone 'Asia/Karachi')
  )
  with check (
    patient_id = auth.uid()
    and status = 'cancelled'
  );

create or replace function public.enforce_patient_appointment_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.patient_id
    and not public.is_admin()
    and new.status = 'cancelled'
  then
    if old.status not in ('pending', 'confirmed')
      or new.status <> 'cancelled'
      or (old.appointment_date + old.appointment_time) <= (now() at time zone 'Asia/Karachi')
      or row(
        new.id,
        new.patient_id,
        new.doctor_id,
        new.appointment_date,
        new.appointment_time,
        new.patient_message,
        new.meeting_link,
        new.created_at
      ) is distinct from row(
        old.id,
        old.patient_id,
        old.doctor_id,
        old.appointment_date,
        old.appointment_time,
        old.patient_message,
        old.meeting_link,
        old.created_at
      )
    then
      raise exception 'Patients may only cancel their own future pending or confirmed appointments.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_patient_appointment_cancellation on public.appointments;
create trigger enforce_patient_appointment_cancellation
  before update on public.appointments
  for each row execute function public.enforce_patient_appointment_cancellation();
