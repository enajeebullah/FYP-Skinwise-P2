-- SkinWISE — allow assigned doctors to read archived appointments
-- Review and apply manually in Supabase SQL Editor.
-- This migration changes only the doctor appointment SELECT policy.

drop policy if exists "Doctors can view their appointments"
  on public.appointments;

create policy "Doctors can view their appointments"
  on public.appointments for select
  to authenticated
  using (
    exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id
        and d.user_id = auth.uid()
    )
  );

