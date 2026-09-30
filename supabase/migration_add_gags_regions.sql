-- SkinWISE — Migration: add region-based GAGS scoring columns
--
-- Run this ONLY if you already ran schema.sql before this update (i.e.
-- your `scans` table already exists). New projects running the current
-- schema.sql don't need this — it's already included there.
--
-- Why this is needed: severity_score used to always be the whole-face
-- weighted count from lib/severity.ts (max 40). It's now the region-based
-- GAGS total from lib/gags.ts (max 32) whenever a face box was available,
-- with the old whole-face score kept only as a fallback. Since the two
-- scales differ, this adds a column recording which max applies to a given
-- row, plus a column storing the per-region breakdown for display/history.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.

alter table public.scans
  add column if not exists severity_max_score integer not null default 32;

alter table public.scans
  add column if not exists region_scores jsonb;
