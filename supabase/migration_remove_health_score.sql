-- SkinWISE — Migration: remove health_score
--
-- health_score was an original heuristic (0-100, from severity + skin
-- type) — not a clinical metric, and the app no longer computes or shows
-- it. Severity is now purely GAGS-based (severity_score, 0-32, from the
-- manual calculator in lib/gags.ts). This drops the now-unused column.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Only needed if you ran schema.sql before this update; new projects
-- running the current schema.sql don't have this column at all.

alter table public.scans
  drop column if exists health_score;
