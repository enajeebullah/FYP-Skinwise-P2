-- Migration: GAGS (Doshi et al. 1997) has been fully removed as the
-- severity system for SkinWISE, replaced by two independent, published
-- methods applied to user-CONFIRMED lesion counts:
--   1. Hayashi (2008) — 4-level lesion-count grading (half-face papule+
--      pustule counts). See lib/hayashi.ts.
--   2. NICE NG198 (2021) — 2-category clinical escalation flag (whole-
--      face inflammatory lesion + nodule counts). See lib/nice.ts.
-- Plus a dominant lesion PATTERN (lib/acnePattern.ts) that drives which
-- acne-care ingredient information the routine engine shows.
--
-- Run this only if your Supabase project was set up before this update
-- (i.e. it still has severity_score/severity_max_score/region_scores).
-- A fresh install of schema.sql already has the new columns.

alter table public.scans
  add column if not exists confirmed_counts jsonb not null default '{}'::jsonb,
  add column if not exists hayashi_left_count integer not null default 0,
  add column if not exists hayashi_right_count integer not null default 0,
  add column if not exists hayashi_count integer not null default 0,
  add column if not exists nice_category text not null default 'mild_to_moderate',
  add column if not exists nice_inflammatory_count integer not null default 0,
  add column if not exists acne_pattern text not null default 'clear',
  add column if not exists professional_evaluation_recommended boolean not null default false;

alter table public.scans
  add constraint scans_nice_category_check
    check (nice_category in ('mild_to_moderate', 'moderate_to_severe'));

alter table public.scans
  add constraint scans_acne_pattern_check
    check (acne_pattern in ('clear', 'comedonal_dominant', 'inflammatory_dominant', 'mixed', 'nodule_present'));

-- The `severity` column is UNCHANGED in shape (same enum values: clear/
-- mild/moderate/severe/very_severe) — it now stores Hayashi severity
-- instead of GAGS-derived severity, so no migration needed for it.

alter table public.scans drop column if exists severity_score;
alter table public.scans drop column if exists severity_max_score;
alter table public.scans drop column if exists region_scores;

comment on column public.scans.severity is
  'Hayashi severity (lib/hayashi.ts) — a 4-level lesion-count grading (Hayashi et al. 2008), based on the worse half-face papule+pustule count. GAGS has been fully removed.';
comment on column public.scans.confirmed_counts is
  'User-confirmed ConfirmedCounts (lib/reviewCounts.ts) — the only input to Hayashi/NICE/pattern scoring, never raw YOLO output directly.';
comment on column public.scans.nice_category is
  'NICE NG198 clinical escalation category (lib/nice.ts) — independent 2-category flag, deliberately not merged with Hayashi severity.';
