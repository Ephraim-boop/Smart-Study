-- =============================================================================
-- StudySmart notes module — private cloud copies of uploaded documents
-- Migration: 0008_note_storage.sql
--
-- WHY THIS EXISTS
-- A student's uploaded notes used to exist only in React state, so a refresh
-- deleted them and Smart Summarize then had nothing to summarize. The app now
-- saves every upload into a private Supabase Storage bucket, under a folder
-- named after the owning user id (`student-notes/<user uuid>/...`), so notes
-- follow the student across devices and survive logout/login.
--
-- PRIVACY MODEL
-- One bucket, shared by all students, separated by the first path segment.
-- Row Level Security on storage.objects compares that segment with the caller's
-- own auth uid, so a student can only ever list / read / write / delete objects
-- inside their own folder. Nobody's notes are public, and no student can read
-- another student's notes.
--
-- Run this in the Supabase Dashboard → SQL Editor. It is idempotent: re-running
-- it after a config change is safe and never deletes stored files.
-- =============================================================================

-- --- the private bucket -----------------------------------------------------
-- No allowed_mime_types restriction: the app validates formats on upload, and a
-- server-side MIME list would reject legitimate documents (e.g. a .docx the
-- browser reported as octet-stream) with a confusing storage error.
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-notes', 'student-notes', false, 15728640)  -- 15 MB, matches src/upload/types.ts
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- --- per-student ownership --------------------------------------------------
-- (storage.objects already has row level security enabled.)

-- A student sees the objects inside their own folder.
drop policy if exists student_notes_owner_read on storage.objects;
create policy student_notes_owner_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'student-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A student can upload into their own folder — and nobody else's.
drop policy if exists student_notes_owner_insert on storage.objects;
create policy student_notes_owner_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'student-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Re-uploading the same note (retry after a dropped connection) stays allowed.
drop policy if exists student_notes_owner_update on storage.objects;
create policy student_notes_owner_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'student-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'student-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Removing a note in the app removes the saved copy too.
drop policy if exists student_notes_owner_delete on storage.objects;
create policy student_notes_owner_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'student-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- make the bucket visible to signed-in students --------------------------
-- Without this, storage.from('student-notes') reports "bucket not found" to a
-- student even though the bucket exists. Only this one bucket is exposed, and
-- only as metadata — the objects themselves stay behind the policies above.
drop policy if exists student_notes_bucket_read on storage.buckets;
create policy student_notes_bucket_read on storage.buckets
  for select
  to authenticated
  using (id = 'student-notes');
