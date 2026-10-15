-- Break the appointment_messages -> storage.objects -> appointment_messages
-- RLS dependency without changing message visibility or Storage policies.
-- Apply after migration_add_appointment_chat_attachments.sql as postgres.

create or replace function public.owns_appointment_chat_attachment(
  p_appointment_id uuid,
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select auth.uid() is not null
    and p_appointment_id is not null
    and p_path is not null
    and split_part(p_path, '/', 1) = p_appointment_id::text
    and array_length(string_to_array(p_path, '/'), 1) = 2
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'appointment-chat-attachments'
        and o.name = p_path
        and o.owner_id = auth.uid()::text
    )
    and exists (
      select 1
      from public.appointments a
      where a.id = p_appointment_id
        and a.status in ('confirmed', 'completed')
        and (
          a.patient_id = auth.uid()
          or exists (
            select 1
            from public.doctors d
            where d.id = a.doctor_id
              and d.user_id = auth.uid()
          )
        )
    );
$function$;

alter function public.owns_appointment_chat_attachment(uuid, text)
  owner to postgres;

revoke all on function public.owns_appointment_chat_attachment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.owns_appointment_chat_attachment(uuid, text)
  to authenticated;

drop policy if exists "Appointment participants can send eligible messages"
  on public.appointment_messages;

create policy "Appointment participants can send eligible messages"
  on public.appointment_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.appointments a
      where a.id = appointment_messages.appointment_id
        and a.status in ('confirmed', 'completed')
        and (
          a.patient_id = auth.uid()
          or exists (
            select 1
            from public.doctors d
            where d.id = a.doctor_id
              and d.user_id = auth.uid()
          )
        )
    )
    and (
      attachment_storage_path is null
      or public.owns_appointment_chat_attachment(
        appointment_messages.appointment_id,
        attachment_storage_path
      )
    )
  );
