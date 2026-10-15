-- Patient feedback for completed consultations.
-- Apply manually after schema.sql and migration_add_consultations.sql. The
-- payments/disputes migration is not a prerequisite.

create table public.consultation_feedback (
  appointment_id uuid primary key
    references public.appointments (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text not null
    check (char_length(btrim(feedback)) between 1 and 2000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultation_feedback_visible_idx
  on public.consultation_feedback (is_hidden, created_at desc);

alter table public.consultation_feedback enable row level security;
revoke all on public.consultation_feedback from public, anon, authenticated;
grant select on public.consultation_feedback to authenticated;
grant insert (appointment_id, rating, feedback)
  on public.consultation_feedback to authenticated;
grant update (rating, feedback, is_hidden)
  on public.consultation_feedback to authenticated;

create policy "Patients can view their appointment feedback"
  on public.consultation_feedback for select
  to authenticated
  using (
    exists (
      select 1
      from public.appointments a
      where a.id = consultation_feedback.appointment_id
        and a.patient_id = auth.uid()
    )
  );

create policy "Patients can review completed appointments"
  on public.consultation_feedback for insert
  to authenticated
  with check (
    not is_hidden
    and exists (
      select 1
      from public.appointments a
      where a.id = consultation_feedback.appointment_id
        and a.patient_id = auth.uid()
        and a.status = 'completed'
    )
  );

create policy "Patients can edit feedback for their completed appointments"
  on public.consultation_feedback for update
  to authenticated
  using (
    exists (
      select 1
      from public.appointments a
      where a.id = consultation_feedback.appointment_id
        and a.patient_id = auth.uid()
        and a.status = 'completed'
    )
  )
  with check (
    exists (
      select 1
      from public.appointments a
      where a.id = consultation_feedback.appointment_id
        and a.patient_id = auth.uid()
        and a.status = 'completed'
    )
  );

create policy "Doctors can view visible feedback for their appointments"
  on public.consultation_feedback for select
  to authenticated
  using (
    not is_hidden
    and exists (
      select 1
      from public.appointments a
      join public.doctors d on d.id = a.doctor_id
      where a.id = consultation_feedback.appointment_id
        and d.user_id = auth.uid()
    )
  );

create policy "Admins can view all consultation feedback"
  on public.consultation_feedback for select
  to authenticated
  using (public.is_admin());

create policy "Admins can moderate consultation feedback"
  on public.consultation_feedback for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.guard_consultation_feedback()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  appointment_patient_id uuid;
  appointment_status text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication is required to submit feedback.'
        using errcode = '42501';
    end if;

    select patient_id, status
    into appointment_patient_id, appointment_status
    from public.appointments
    where id = new.appointment_id;

    if not found
      or appointment_patient_id <> auth.uid()
      or appointment_status <> 'completed'
      or new.is_hidden
    then
      raise exception 'Feedback is allowed only for your own completed appointment.'
        using errcode = '42501';
    end if;

    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.appointment_id is distinct from old.appointment_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Feedback cannot be reassigned to another appointment.';
  end if;

  if public.is_admin() then
    if new.rating is distinct from old.rating
      or new.feedback is distinct from old.feedback
    then
      raise exception 'Administrators may moderate visibility but cannot edit patient feedback.';
    end if;
  else
    if new.is_hidden is distinct from old.is_hidden then
      raise exception 'Only administrators can moderate feedback visibility.'
        using errcode = '42501';
    end if;

    select patient_id, status
    into appointment_patient_id, appointment_status
    from public.appointments
    where id = old.appointment_id;

    if auth.uid() is null
      or appointment_patient_id <> auth.uid()
      or appointment_status <> 'completed'
    then
      raise exception 'Only the patient may edit feedback for their completed appointment.'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.guard_consultation_feedback() from public, anon, authenticated;

create trigger guard_consultation_feedback
  before insert or update on public.consultation_feedback
  for each row execute function public.guard_consultation_feedback();

create table public.consultation_feedback_admin_notes (
  appointment_id uuid primary key
    references public.consultation_feedback (appointment_id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.consultation_feedback_admin_notes enable row level security;
revoke all on public.consultation_feedback_admin_notes from public, anon, authenticated;
grant select on public.consultation_feedback_admin_notes to authenticated;

create policy "Admins can view feedback moderation notes"
  on public.consultation_feedback_admin_notes for select
  to authenticated
  using (public.is_admin());

create or replace function public.moderate_consultation_feedback(
  p_appointment_id uuid,
  p_is_hidden boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can moderate consultation feedback.'
      using errcode = '42501';
  end if;

  if p_is_hidden is null
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'Choose a visibility state and provide a moderation reason.'
      using errcode = '22023';
  end if;

  update public.consultation_feedback
  set is_hidden = p_is_hidden
  where appointment_id = p_appointment_id;

  if not found then
    raise exception 'Feedback for this appointment was not found.'
      using errcode = '22023';
  end if;

  insert into public.consultation_feedback_admin_notes (
    appointment_id,
    reason,
    updated_by
  )
  values (p_appointment_id, btrim(p_reason), auth.uid())
  on conflict (appointment_id) do update
    set reason = excluded.reason,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

revoke all on function public.moderate_consultation_feedback(uuid, boolean, text) from public, anon;
grant execute on function public.moderate_consultation_feedback(uuid, boolean, text) to authenticated;

comment on table public.consultation_feedback is
  'One patient rating per completed appointment. Patient identity is derived from the appointment and is not exposed as a feedback column.';
comment on column public.consultation_feedback.is_hidden is
  'Admin-controlled moderation flag; hidden feedback remains visible to its patient and authorized admins but not to doctors.';
