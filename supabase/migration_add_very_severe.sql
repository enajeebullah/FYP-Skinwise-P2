-- SkinWISE — Migration: add "very_severe" tier + weighted severity score
--
-- Run this ONLY if you already ran schema.sql before this update (i.e. your
-- `scans` table already exists). New projects running the current
-- schema.sql don't need this — it's already included there.
--
-- Why this is needed: the severity grading logic was upgraded from a
-- simple total-lesion-count threshold to a GAGS-inspired weighted score
-- with 4 tiers instead of 3 (added "very_severe"). The old check
-- constraint only allowed ('clear','mild','moderate','severe') — without
-- this migration, any new scan graded "very_severe" will fail to save.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.

alter table public.scans
  drop constraint if exists scans_severity_check;

alter table public.scans
  add constraint scans_severity_check
  check (severity in ('clear', 'mild', 'moderate', 'severe', 'very_severe'));

alter table public.scans
  add column if not exists severity_score integer not null default 0;
