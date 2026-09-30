-- SkinWISE — Supabase database schema
-- Run this once in your Supabase project's SQL Editor (Project → SQL Editor → New query).

-- ─── Profiles table ──────────────────────────────────────────────────────
-- Supabase Auth already manages the `auth.users` table (email, password
-- hash, Google OAuth identity, etc). This `profiles` table extends it with
-- app-specific fields, and is linked 1-to-1 via the same UUID.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  -- Self-reported contraindication flags (see lib/constants.ts SafetyFlags).
  -- When any flag is true, the full personalised routine (cleanser,
  -- moisturizer, SPF, actives) is paused — the skin/acne analysis itself
  -- still runs normally.
  safety_flags jsonb not null default '{"pregnantOrBreastfeeding": false, "onIsotretinoin": false, "openWoundOrInfection": false, "knownActiveAllergy": false, "under15": false}'::jsonb,
  -- False until the user completes or skips the one-time Safety Profile
  -- onboarding step shown right after their first login.
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Automatically creates a profile row whenever a new user signs up
-- (email/password or Google) — this is why the trigger runs as the
-- table owner (`security definer`) rather than the signing-up user.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Scans table ─────────────────────────────────────────────────────────
-- One row per completed analysis. This is what powers the "progress
-- tracking" / patient history feature in the project overview.
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  skin_type text not null check (skin_type in ('dry', 'normal', 'oily')),
  skin_confidence numeric not null,
  lesion_counts jsonb not null,       -- { comedone, nodules, papules, pustules }
  total_lesions integer not null,
  confirmed_counts jsonb not null default '{}'::jsonb, -- ConfirmedCounts (lib/reviewCounts.ts):
                                              -- user-confirmed { comedones, leftPapules,
                                              -- rightPapules, leftPustules, rightPustules,
                                              -- nodules } — the ONLY input to scoring below.
                                              -- Never raw YOLO output directly.
  overall_severity text not null default 'clear'
    check (overall_severity in ('clear', 'mild', 'moderate', 'severe')),
                                              -- The single severity value used by the UI and routine engine.
  acne_pattern text not null default 'clear'
    check (acne_pattern in ('clear', 'comedonal_dominant', 'inflammatory_dominant', 'mixed')),
                                              -- Dominant lesion pattern (lib/acnePattern.ts)
                                              -- — drives which acne-care ingredient
                                              -- information the routine engine shows.
  weather jsonb,                       -- { temperatureC, humidityPct, uvIndex } or null
  routine jsonb not null,              -- generated routine snapshot at scan time
  recommendation_paused boolean not null default false, -- true if the routine was withheld due to a safety flag
  paused_reasons jsonb,                 -- snapshot of the human-readable pause reasons, if paused
  professional_evaluation_recommended boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.scans enable row level security;

create policy "Users can view their own scans"
  on public.scans for select
  using (auth.uid() = user_id);

create policy "Users can insert their own scans"
  on public.scans for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own scans"
  on public.scans for delete
  using (auth.uid() = user_id);

create index if not exists scans_user_id_created_at_idx
  on public.scans (user_id, created_at desc);
