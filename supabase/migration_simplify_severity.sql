-- Remove legacy scoring and calculation-specific values from persisted scans.
-- confirmed_counts remains the source data; overall_severity is the only
-- severity value stored after this migration.

alter table public.scans
  drop column if exists severity,
  drop column if exists severity_score,
  drop column if exists severity_max_score,
  drop column if exists region_scores,
  drop column if exists health_score,
  drop column if exists hayashi_left_count,
  drop column if exists hayashi_right_count,
  drop column if exists hayashi_count,
  drop column if exists nice_category,
  drop column if exists nice_inflammatory_count;
