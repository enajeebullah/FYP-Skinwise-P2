-- Apply in this order:
-- 1. migration_add_consultations.sql
-- 2. migration_add_appointment_chat.sql, if appointment_messages is not already set up
-- 3. this migration
-- Never apply migration_add_appointment_chat.sql after this migration.
-- Allowed MIME types are metadata checks, not file-content/signature validation.

create table if not exists public.appointment_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null
    references public.appointments (id) on delete cascade,
  sender_id uuid not null
    references auth.users (id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  attachment_storage_path text,
  attachment_file_name text,
  attachment_content_type text,
  attachment_size_bytes bigint
);

alter table public.appointment_messages
  add column if not exists attachment_storage_path text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_content_type text,
  add column if not exists attachment_size_bytes bigint;

create index if not exists appointment_messages_appointment_created_idx
  on public.appointment_messages (appointment_id, created_at, id);

alter table public.appointment_messages
  alter column message drop not null;

alter table public.appointment_messages
  drop constraint if exists appointment_messages_message_check;
alter table public.appointment_messages
  drop constraint if exists appointment_messages_content_check;
alter table public.appointment_messages
  add constraint appointment_messages_content_check
    check (
      (
        message is null
        or (
          char_length(message) between 1 and 2000
          and message ~ '[^[:space:]]'
        )
      )
      and (message is not null or attachment_storage_path is not null)
    );

alter table public.appointment_messages
  drop constraint if exists appointment_messages_attachment_metadata_check;
alter table public.appointment_messages
  add constraint appointment_messages_attachment_metadata_check
    check (
      (
        attachment_storage_path is null
        and attachment_file_name is null
        and attachment_content_type is null
        and attachment_size_bytes is null
      )
      or (
        attachment_storage_path is not null
        and attachment_file_name is not null
        and char_length(attachment_file_name) between 1 and 255
        and attachment_content_type is not null
        and attachment_content_type in (
          'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
        )
        and attachment_size_bytes is not null
        and attachment_size_bytes between 1 and 10485760
        and split_part(attachment_storage_path, '/', 1) = appointment_id::text
        and split_part(attachment_storage_path, '/', 2) ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|pdf)$'
        and array_length(string_to_array(attachment_storage_path, '/'), 1) = 2
        and (
          (attachment_content_type = 'image/jpeg' and attachment_storage_path ~ '\.(jpg|jpeg)$')
          or (attachment_content_type = 'image/png' and attachment_storage_path ~ '\.png$')
          or (attachment_content_type = 'image/webp' and attachment_storage_path ~ '\.webp$')
          or (attachment_content_type = 'image/gif' and attachment_storage_path ~ '\.gif$')
          or (attachment_content_type = 'application/pdf' and attachment_storage_path ~ '\.pdf$')
        )
      )
    );

create unique index if not exists appointment_messages_attachment_path_unique_idx
  on public.appointment_messages (attachment_storage_path)
  where attachment_storage_path is not null;

alter table public.appointment_messages enable row level security;
grant select on public.appointment_messages to authenticated;
grant insert (
  appointment_id,
  sender_id,
  message,
  attachment_storage_path,
  attachment_file_name,
  attachment_content_type,
  attachment_size_bytes
) on public.appointment_messages to authenticated;

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
    and (
      attachment_storage_path is null
      or exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'appointment-chat-attachments'
          and o.name = appointment_messages.attachment_storage_path
          and o.owner_id::text = auth.uid()::text
      )
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'appointment-chat-attachments',
  'appointment-chat-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'appointment-chat-attachments'
      and name = 'appointment-chat-attachments'
      and public is false
      and file_size_limit = 10485760
      and allowed_mime_types = array[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
      ]::text[]
  ) then
    raise exception
      'Bucket appointment-chat-attachments is missing or has unexpected settings; review it manually before applying this migration.';
  end if;
end;
$$;

drop policy if exists "Appointment participants can view chat attachments"
  on storage.objects;
create policy "Appointment participants can view chat attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'appointment-chat-attachments'
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|pdf)$'
    and exists (
      select 1
      from public.appointments a
      where a.id::text = (storage.foldername(name))[1]
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
      exists (
        select 1
        from public.appointment_messages m
        where m.attachment_storage_path = name
          and m.appointment_id::text = (storage.foldername(name))[1]
      )
      or (
        owner_id::text = auth.uid()::text
        and not exists (
          select 1
          from public.appointment_messages m
          where m.attachment_storage_path = name
        )
      )
    )
  );

drop policy if exists "Appointment participants can upload chat attachments"
  on storage.objects;
create policy "Appointment participants can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'appointment-chat-attachments'
    and owner_id::text = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|pdf)$'
    and exists (
      select 1
      from public.appointments a
      where a.id::text = (storage.foldername(name))[1]
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

drop policy if exists "Uploaders can remove unattached chat files"
  on storage.objects;
create policy "Uploaders can remove unattached chat files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'appointment-chat-attachments'
    and owner_id::text = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|pdf)$'
    and exists (
        select 1
        from public.appointments a
        where a.id::text = (storage.foldername(name))[1]
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
    and not exists (
        select 1
        from public.appointment_messages m
        where m.attachment_storage_path = name
    )
  );
