
create or replace function public.get_doctor_consultation_payment_status(
  p_appointment_ids uuid[]
)
returns table (
  appointment_id uuid,
  status text,
  status_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.appointment_id,
    p.status,
    p.status_reason
  from public.consultation_payments p
  join public.appointments a
    on a.id = p.appointment_id
   and a.doctor_id = p.doctor_id
  join public.doctors d
    on d.id = a.doctor_id
  where d.user_id = auth.uid()
    and p.appointment_id = any(coalesce(p_appointment_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_doctor_consultation_payment_status(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_doctor_consultation_payment_status(uuid[])
  to authenticated;
