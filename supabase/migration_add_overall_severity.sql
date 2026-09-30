-- Migration: adds Overall Severity (lib/overallSeverity.ts) — the value
-- that now actually drives the routine engine's acne-care ingredient
-- choices. Combines Hayashi severity + a graduated nodule-tier (1
-- nodule→Mild, 2→Moderate, 3+→Severe), floored to Severe if NICE NG198's
-- own threshold is met.
--
-- Also removes 'nodule_present' from acne_pattern: an earlier version let
-- any nodule override the detected comedonal/inflammatory/mixed pattern
-- entirely, which meant a large inflammatory lesion count (e.g. 25
-- papules/pustules) lost its evidence-based ingredient guidance just
-- because one nodule was also present. Nodules now influence the
-- recommendation ONLY through Overall Severity's nodule-tier and the
-- accompanying nodule note — pattern classification no longer looks at
-- nodules at all.
--
-- Run this only if your Supabase project was set up before this update.
-- A fresh install of schema.sql already has these columns/constraints.

alter table public.scans
  add column if not exists overall_severity text not null default 'clear';

alter table public.scans
  add constraint scans_overall_severity_check
    check (overall_severity in ('clear', 'mild', 'moderate', 'severe'));

-- Re-create the acne_pattern check without 'nodule_present'. Any existing
-- rows with acne_pattern = 'nodule_present' are re-classified to 'mixed'
-- as a reasonable default (they had both nodules and other lesion types
-- when saved) — this only affects historical display, not new scans.
update public.scans set acne_pattern = 'mixed' where acne_pattern = 'nodule_present';

alter table public.scans drop constraint if exists scans_acne_pattern_check;
alter table public.scans
  add constraint scans_acne_pattern_check
    check (acne_pattern in ('clear', 'comedonal_dominant', 'inflammatory_dominant', 'mixed'));

comment on column public.scans.overall_severity is
  'lib/overallSeverity.ts — max(Hayashi severity, nodule tier), floored to Severe by the NICE threshold. Drives routine-engine acne-care choices.';
