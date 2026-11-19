-- Remove the intentionally-saved "My Notes" feature and its private table.
-- This migration is destructive to legacy study_notes data by design.

drop trigger if exists study_notes_touch_updated_at on public.study_notes;
drop table if exists public.study_notes cascade;
