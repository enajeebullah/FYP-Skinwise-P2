-- SkinWISE — Migration: Safety / Contraindication Profile feature
--
-- Run this ONLY if you already ran schema.sql before this update (i.e. your
-- `profiles` and `scans` tables already exist). New projects running the
-- current schema.sql don't need this — it's already included there.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.

alter table public.profiles
  add column if not exists safety_flags jsonb not null default
    '{"pregnantOrBreastfeeding": false, "onIsotretinoin": false, "openWoundOrInfection": false, "knownActiveAllergy": false}'::jsonb;

alter table public.scans
  add column if not exists recommendation_paused boolean not null default false;

alter table public.scans
  add column if not exists paused_reasons jsonb;
