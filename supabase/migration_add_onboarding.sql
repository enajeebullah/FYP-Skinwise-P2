-- SkinWISE — Migration: One-time Safety Profile onboarding
--
-- Run this ONLY if you already ran schema.sql before this update (i.e. your
-- `profiles` table already exists). New projects running the current
-- schema.sql don't need this — it's already included there.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;
