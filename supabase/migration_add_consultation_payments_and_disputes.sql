no

create table public.consultation_payment_settings (
  id smallint primary key default 1 check (id = 1),
  commission_rate numeric(5, 4) not null default 0.1500
    check (commission_rate >= 0 and commission_rate <= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.consultation_payment_settings (id, commission_rate)
values (1, 0.1500)
on conflict (id) do nothing;

alter table public.consultation_payment_settings enable row level security;
revoke all on public.consultation_payment_settings from public, anon, authenticated;
grant select on public.consultation_payment_settings to authenticated;

create policy "Admins can view consultation payment settings"
  on public.consultation_payment_settings for select
  to authenticated
  using (public.is_admin());

create or replace function public.set_consultation_commission_rate(p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change the consultation commission rate.'
      using errcode = '42501';
  end if;

  if p_rate is null or p_rate < 0 or p_rate > 1 then
    raise exception 'Commission rate must be between 0 and 1.'
      using errcode = '22023';
  end if;

  update public.consultation_payment_settings
  set commission_rate = p_rate,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 1;
end;
$$;

revoke all on function public.set_consultation_commission_rate(numeric) from public, anon;
grant execute on function public.set_consultation_commission_rate(numeric) to authenticated;

create table public.consultation_payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique
    references public.appointments (id) on delete restrict,
  patient_id uuid not null
    references public.profiles (id) on delete restrict,
  doctor_id uuid not null
    references public.doctors (id) on delete restrict,
  method text not null check (method in ('jazzcash', 'easypaisa')),
  is_simulated boolean not null default true check (is_simulated),
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PKR' check (currency = 'PKR'),
  commission_rate numeric(5, 4) not null
    check (commission_rate >= 0 and commission_rate <= 1),
  commission_amount numeric(10, 2) not null check (commission_amount >= 0),
  doctor_net_amount numeric(10, 2) not null check (doctor_net_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'simulated_paid', 'failed', 'simulated_refunded')),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint consultation_payments_amounts_match
    check (commission_amount + doctor_net_amount = amount)
);

create index consultation_payments_patient_created_idx
  on public.consultation_payments (patient_id, created_at desc);
create index consultation_payments_status_created_idx
  on public.consultation_payments (status, created_at desc);

alter table public.consultation_payments enable row level security;
revoke all on public.consultation_payments from public, anon, authenticated;
grant select on public.consultation_payments to authenticated;

create policy "Patients can view their own consultation payments"
  on public.consultation_payments for select
  to authenticated
  using (patient_id = auth.uid());

create policy "Admins can view consultation payments"
  on public.consultation_payments for select
  to authenticated
  using (public.is_admin());

create or replace function public.guard_consultation_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  appointment_patient_id uuid;
  appointment_doctor_id uuid;
  appointment_status text;
  current_fee numeric(10, 2);
  current_commission_rate numeric(5, 4);
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.patient_id <> auth.uid() then
      raise exception 'A payment can only be created for the authenticated patient.'
        using errcode = '42501';
    end if;

    select a.patient_id, a.doctor_id, a.status, d.consultation_fee
    into appointment_patient_id, appointment_doctor_id, appointment_status, current_fee
    from public.appointments a
    join public.doctors d on d.id = a.doctor_id
    where a.id = new.appointment_id;

    if not found
      or appointment_patient_id <> new.patient_id
      or appointment_doctor_id <> new.doctor_id
      or appointment_status not in ('confirmed', 'completed')
      or current_fee is null
      or current_fee <= 0
    then
      raise exception 'The appointment is not eligible for a demo payment.'
        using errcode = '22023';
    end if;

    select commission_rate
    into current_commission_rate
    from public.consultation_payment_settings
    where id = 1;

    if new.is_simulated is distinct from true
      or new.amount is distinct from current_fee
      or new.currency <> 'PKR'
      or new.commission_rate is distinct from current_commission_rate
      or new.commission_amount is distinct from round(current_fee * current_commission_rate, 2)
      or new.doctor_net_amount is distinct from
        current_fee - round(current_fee * current_commission_rate, 2)
      or new.status <> 'pending'
    then
      raise exception 'Payment amounts and commission must be derived from the stored appointment and settings.'
        using errcode = '22023';
    end if;

    new.created_at := now();
    new.updated_at := now();
    new.settled_at := null;
    return new;
  end if;

  if row(
    new.appointment_id,
    new.patient_id,
    new.doctor_id,
    new.method,
    new.is_simulated,
    new.amount,
    new.currency,
    new.commission_rate,
    new.commission_amount,
    new.doctor_net_amount,
    new.created_at
  ) is distinct from row(
    old.appointment_id,
    old.patient_id,
    old.doctor_id,
    old.method,
    old.is_simulated,
    old.amount,
    old.currency,
    old.commission_rate,
    old.commission_amount,
    old.doctor_net_amount,
    old.created_at
  ) then
    raise exception 'Payment method, ownership, and accounting snapshots are immutable.';
  end if;

  if not public.is_admin() then
    raise exception 'Only administrators can change demo payment status.'
      using errcode = '42501';
  end if;

  if not (
    (old.status = 'pending' and new.status in ('simulated_paid', 'failed'))
    or (old.status = 'simulated_paid' and new.status = 'simulated_refunded')
  ) then
    raise exception 'Invalid demo payment status transition.'
      using errcode = '22023';
  end if;

  new.updated_at := now();
  if new.status in ('simulated_paid', 'failed', 'simulated_refunded') then
    new.settled_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.guard_consultation_payment() from public, anon, authenticated;

create trigger guard_consultation_payment
  before insert or update on public.consultation_payments
  for each row execute function public.guard_consultation_payment();

create or replace function public.create_consultation_demo_payment(
  p_appointment_id uuid,
  p_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  appointment_patient_id uuid;
  appointment_doctor_id uuid;
  appointment_status text;
  current_fee numeric(10, 2);
  current_commission_rate numeric(5, 4);
  new_payment_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to create a demo payment.'
      using errcode = '42501';
  end if;

  if p_method is null or p_method not in ('jazzcash', 'easypaisa') then
    raise exception 'Choose JazzCash or Easypaisa for the simulated transaction.'
      using errcode = '22023';
  end if;

  select a.patient_id, a.doctor_id, a.status, d.consultation_fee
  into appointment_patient_id, appointment_doctor_id, appointment_status, current_fee
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  where a.id = p_appointment_id
  for update of a;

  if not found
    or appointment_patient_id <> caller_id
    or appointment_status not in ('confirmed', 'completed')
    or current_fee is null
    or current_fee <= 0
  then
    raise exception 'The appointment is not eligible for a demo payment.'
      using errcode = '22023';
  end if;

  select commission_rate
  into current_commission_rate
  from public.consultation_payment_settings
  where id = 1;

  if current_commission_rate is null then
    raise exception 'Consultation payment settings are missing.'
      using errcode = '55000';
  end if;

  insert into public.consultation_payments (
    appointment_id,
    patient_id,
    doctor_id,
    method,
    is_simulated,
    amount,
    currency,
    commission_rate,
    commission_amount,
    doctor_net_amount,
    status
  )
  values (
    p_appointment_id,
    caller_id,
    appointment_doctor_id,
    p_method,
    true,
    current_fee,
    'PKR',
    current_commission_rate,
    round(current_fee * current_commission_rate, 2),
    current_fee - round(current_fee * current_commission_rate, 2),
    'pending'
  )
  returning id into new_payment_id;

  return new_payment_id;
end;
$$;

revoke all on function public.create_consultation_demo_payment(uuid, text) from public, anon;
grant execute on function public.create_consultation_demo_payment(uuid, text) to authenticated;

create or replace function public.resolve_consultation_demo_payment(
  p_payment_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can resolve demo payment status.'
      using errcode = '42501';
  end if;

  if p_status not in ('simulated_paid', 'failed') then
    raise exception 'Administrators may only mark a demo payment simulated_paid or failed.'
      using errcode = '22023';
  end if;

  update public.consultation_payments
  set status = p_status,
      status_reason = nullif(btrim(p_reason), '')
  where id = p_payment_id
    and status = 'pending';

  if not found then
    raise exception 'The payment does not exist or is no longer pending.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.resolve_consultation_demo_payment(uuid, text, text) from public, anon;
grant execute on function public.resolve_consultation_demo_payment(uuid, text, text) to authenticated;

create table public.consultation_refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique
    references public.consultation_payments (id) on delete restrict,
  appointment_id uuid not null
    references public.appointments (id) on delete restrict,
  patient_id uuid not null
    references public.profiles (id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected')),
  admin_decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);

create index consultation_refund_requests_patient_created_idx
  on public.consultation_refund_requests (patient_id, created_at desc);

alter table public.consultation_refund_requests enable row level security;
revoke all on public.consultation_refund_requests from public, anon, authenticated;
grant select on public.consultation_refund_requests to authenticated;

create policy "Patients can view their own refund requests"
  on public.consultation_refund_requests for select
  to authenticated
  using (patient_id = auth.uid());

create policy "Admins can view refund requests"
  on public.consultation_refund_requests for select
  to authenticated
  using (public.is_admin());

create table public.consultation_refund_admin_notes (
  refund_request_id uuid primary key
    references public.consultation_refund_requests (id) on delete cascade,
  notes text not null check (char_length(btrim(notes)) between 1 and 4000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.consultation_refund_admin_notes enable row level security;
revoke all on public.consultation_refund_admin_notes from public, anon, authenticated;
grant select on public.consultation_refund_admin_notes to authenticated;

create policy "Admins can view refund investigation notes"
  on public.consultation_refund_admin_notes for select
  to authenticated
  using (public.is_admin());

create or replace function public.create_consultation_refund_request(
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  payment_appointment_id uuid;
  payment_patient_id uuid;
  payment_status text;
  new_request_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to request a refund.'
      using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'Provide a refund reason between 1 and 2000 characters.'
      using errcode = '22023';
  end if;

  select appointment_id, patient_id, status
  into payment_appointment_id, payment_patient_id, payment_status
  from public.consultation_payments
  where id = p_payment_id
  for update;

  if not found
    or payment_patient_id <> caller_id
    or payment_status <> 'simulated_paid'
  then
    raise exception 'Only your simulated-paid appointment transaction can be submitted for refund review.'
      using errcode = '42501';
  end if;

  insert into public.consultation_refund_requests (
    payment_id,
    appointment_id,
    patient_id,
    reason
  )
  values (p_payment_id, payment_appointment_id, caller_id, btrim(p_reason))
  returning id into new_request_id;

  return new_request_id;
end;
$$;

revoke all on function public.create_consultation_refund_request(uuid, text) from public, anon;
grant execute on function public.create_consultation_refund_request(uuid, text) to authenticated;

create or replace function public.resolve_consultation_refund_request(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_payment_id uuid;
  refund_status text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can resolve refund requests.'
      using errcode = '42501';
  end if;

  if p_decision is null
    or p_decision not in ('approved', 'rejected')
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'Choose approved or rejected and provide a decision reason.'
      using errcode = '22023';
  end if;

  select payment_id, status
  into refund_payment_id, refund_status
  from public.consultation_refund_requests
  where id = p_request_id
  for update;

  if not found or refund_status <> 'requested' then
    raise exception 'The refund request does not exist or has already been resolved.'
      using errcode = '22023';
  end if;

  perform 1
  from public.consultation_payments
  where id = refund_payment_id
    and status = 'simulated_paid'
  for update;

  if not found then
    raise exception 'The associated payment is not eligible for refund review.'
      using errcode = '22023';
  end if;

  update public.consultation_refund_requests
  set status = p_decision,
      admin_decision_reason = btrim(p_reason),
      updated_at = now(),
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_request_id;

  if p_decision = 'approved' then
    update public.consultation_payments
    set status = 'simulated_refunded',
        status_reason = 'Refund approved for demo purposes; no money was transferred.'
    where id = refund_payment_id;
  end if;
end;
$$;

revoke all on function public.resolve_consultation_refund_request(uuid, text, text) from public, anon;
grant execute on function public.resolve_consultation_refund_request(uuid, text, text) to authenticated;

create or replace function public.set_consultation_refund_admin_notes(
  p_request_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can update private refund investigation notes.'
      using errcode = '42501';
  end if;

  if p_notes is null or char_length(btrim(p_notes)) not between 1 and 4000 then
    raise exception 'Private notes must contain between 1 and 4000 characters.'
      using errcode = '22023';
  end if;

  insert into public.consultation_refund_admin_notes (
    refund_request_id,
    notes,
    updated_by
  )
  values (p_request_id, btrim(p_notes), auth.uid())
  on conflict (refund_request_id) do update
    set notes = excluded.notes,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

revoke all on function public.set_consultation_refund_admin_notes(uuid, text) from public, anon;
grant execute on function public.set_consultation_refund_admin_notes(uuid, text) to authenticated;

create table public.consultation_complaints (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null
    references public.appointments (id) on delete restrict,
  payment_id uuid
    references public.consultation_payments (id) on delete restrict,
  patient_id uuid not null
    references public.profiles (id) on delete restrict,
  doctor_id uuid not null
    references public.doctors (id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 4000),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  admin_decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index consultation_complaints_patient_created_idx
  on public.consultation_complaints (patient_id, created_at desc);
create index consultation_complaints_doctor_created_idx
  on public.consultation_complaints (doctor_id, created_at desc);

alter table public.consultation_complaints enable row level security;
revoke all on public.consultation_complaints from public, anon, authenticated;
grant select on public.consultation_complaints to authenticated;

create policy "Patients can view their own complaints"
  on public.consultation_complaints for select
  to authenticated
  using (patient_id = auth.uid());

create policy "Admins can view consultation complaints"
  on public.consultation_complaints for select
  to authenticated
  using (public.is_admin());

create table public.consultation_complaint_admin_notes (
  complaint_id uuid primary key
    references public.consultation_complaints (id) on delete cascade,
  notes text not null check (char_length(btrim(notes)) between 1 and 4000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.consultation_complaint_admin_notes enable row level security;
revoke all on public.consultation_complaint_admin_notes from public, anon, authenticated;
grant select on public.consultation_complaint_admin_notes to authenticated;

create policy "Admins can view complaint investigation notes"
  on public.consultation_complaint_admin_notes for select
  to authenticated
  using (public.is_admin());

create or replace function public.create_consultation_complaint(
  p_appointment_id uuid,
  p_reason text,
  p_payment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  appointment_patient_id uuid;
  appointment_doctor_id uuid;
  new_complaint_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to submit a complaint.'
      using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 4000 then
    raise exception 'Provide a complaint between 1 and 4000 characters.'
      using errcode = '22023';
  end if;

  select patient_id, doctor_id
  into appointment_patient_id, appointment_doctor_id
  from public.appointments
  where id = p_appointment_id;

  if not found or appointment_patient_id <> caller_id then
    raise exception 'A complaint can only be linked to your own appointment.'
      using errcode = '42501';
  end if;

  if p_payment_id is not null and not exists (
    select 1
    from public.consultation_payments p
    where p.id = p_payment_id
      and p.appointment_id = p_appointment_id
      and p.patient_id = caller_id
  ) then
    raise exception 'The optional payment must belong to this appointment and patient.'
      using errcode = '42501';
  end if;

  insert into public.consultation_complaints (
    appointment_id,
    payment_id,
    patient_id,
    doctor_id,
    reason
  )
  values (
    p_appointment_id,
    p_payment_id,
    caller_id,
    appointment_doctor_id,
    btrim(p_reason)
  )
  returning id into new_complaint_id;

  return new_complaint_id;
end;
$$;

revoke all on function public.create_consultation_complaint(uuid, text, uuid) from public, anon;
grant execute on function public.create_consultation_complaint(uuid, text, uuid) to authenticated;

create or replace function public.resolve_consultation_complaint(
  p_complaint_id uuid,
  p_status text,
  p_decision_reason text,
  p_private_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review or resolve complaints.'
      using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('in_review', 'resolved', 'dismissed') then
    raise exception 'Choose in_review, resolved, or dismissed.'
      using errcode = '22023';
  end if;

  if p_status in ('resolved', 'dismissed')
    and (p_decision_reason is null or char_length(btrim(p_decision_reason)) not between 1 and 2000)
  then
    raise exception 'A decision reason is required to resolve or dismiss a complaint.'
      using errcode = '22023';
  end if;

  select status
  into current_status
  from public.consultation_complaints
  where id = p_complaint_id
  for update;

  if not found or current_status not in ('open', 'in_review') then
    raise exception 'The complaint does not exist or has already been resolved.'
      using errcode = '22023';
  end if;

  update public.consultation_complaints
  set status = p_status,
      admin_decision_reason = nullif(btrim(p_decision_reason), ''),
      updated_at = now(),
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end,
      resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else null end
  where id = p_complaint_id;

  if p_private_notes is not null and btrim(p_private_notes) <> '' then
    if char_length(btrim(p_private_notes)) > 4000 then
      raise exception 'Private notes cannot exceed 4000 characters.'
        using errcode = '22023';
    end if;

    insert into public.consultation_complaint_admin_notes (
      complaint_id,
      notes,
      updated_by
    )
    values (p_complaint_id, btrim(p_private_notes), auth.uid())
    on conflict (complaint_id) do update
      set notes = excluded.notes,
          updated_at = now(),
          updated_by = auth.uid();
  end if;
end;
$$;

revoke all on function public.resolve_consultation_complaint(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_consultation_complaint(uuid, text, text, text) to authenticated;

create or replace function public.get_consultation_commission_report(
  p_from date default null,
  p_to date default null
)
returns table (
  payment_month date,
  currency text,
  simulated_paid_count bigint,
  simulated_refunded_count bigint,
  gross_simulated_paid numeric,
  gross_simulated_refunded numeric,
  net_simulated_commission numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can view commission reports.'
      using errcode = '42501';
  end if;

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'The report start date must not be after its end date.'
      using errcode = '22023';
  end if;

  return query
  select
    date_trunc('month', p.created_at at time zone 'UTC')::date,
    p.currency,
    count(*) filter (where p.status = 'simulated_paid'),
    count(*) filter (where p.status = 'simulated_refunded'),
    coalesce(sum(p.amount) filter (where p.status = 'simulated_paid'), 0),
    coalesce(sum(p.amount) filter (where p.status = 'simulated_refunded'), 0),
    coalesce(sum(p.commission_amount) filter (where p.status = 'simulated_paid'), 0)
      - coalesce(sum(p.commission_amount) filter (where p.status = 'simulated_refunded'), 0)
  from public.consultation_payments p
  where p.status in ('simulated_paid', 'simulated_refunded')
    and (p_from is null or p.created_at >= (p_from::timestamp at time zone 'UTC'))
    and (p_to is null or p.created_at < ((p_to + 1)::timestamp at time zone 'UTC'))
  group by date_trunc('month', p.created_at at time zone 'UTC')::date, p.currency
  order by date_trunc('month', p.created_at at time zone 'UTC')::date, p.currency;
end;
$$;

revoke all on function public.get_consultation_commission_report(date, date) from public, anon;
grant execute on function public.get_consultation_commission_report(date, date) to authenticated;

comment on table public.consultation_payments is
  'Demo-only simulated payment records. No gateway integration or real-money transfer is performed.';
comment on column public.consultation_payments.is_simulated is
  'Always true for this demo system; simulated statuses are not real gateway settlements.';
comment on column public.consultation_payments.commission_rate is
  'Immutable rate snapshot from consultation_payment_settings at payment creation.';
comment on function public.get_consultation_commission_report(date, date) is
  'Admin-only demo totals grouped by payment creation month; refunds reverse commission in that original period and all values are simulated.';
