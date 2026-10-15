-- Appointment chat messages. Run after migration_add_consultations.sql.
-- Only the appointment's patient and assigned doctor may read or insert
-- messages, and only while the appointment is confirmed or completed.
-- Run this before migration_add_appointment_chat_attachments.sql. The guard
-- prevents this text-only migration from reverting attachment support.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointment_messages'
      and column_name = 'attachment_storage_path'
  ) then
    raise exception
      'Appointment chat attachments are already configured; do not re-run migration_add_appointment_chat.sql afterward.';
  end if;
end;
$$;

create table if not exists public.appointment_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null
    references public.appointments (id) on delete cascade,
  sender_id uuid not null
    references auth.users (id) on delete cascade,
  message text not null
    check (
      char_length(message) between 1 and 2000
      and message ~ '[^[:space:]]'
    ),
  created_at timestamptz not null default now()
);

create index if not exists appointment_messages_appointment_created_idx
  on public.appointment_messages (appointment_id, created_at, id);

alter table public.appointment_messages enable row level security;

revoke all on public.appointment_messages from public, anon, authenticated;
grant select on public.appointment_messages to authenticated;
grant insert (appointment_id, sender_id, message)
  on public.appointment_messages to authenticated;

drop policy if exists "Appointment participants can view eligible messages"
  on public.appointment_messages;
create policy "Appointment participants can view eligible messages"
  on public.appointment_messages for select
  to authenticated
  using (
    exists (
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
  );

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
  );
