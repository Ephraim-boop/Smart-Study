import { getSupabase } from '../subscription/lib/supabaseClient';
import {
  deleteDeviceNote,
  getDeviceNote,
  listDeviceNotes,
  putDeviceNote,
  type DeviceNoteRecord,
} from './deviceNoteStore';
import { guessMime, type NoteSource } from './types';

/**
 * Where a student's uploaded document actually lives.
 *
 * Two copies, on purpose:
 *   1. Supabase Storage under `student-notes/<userId>/...` — the student's own
 *      private, server-side copy. Row Level Security (see
 *      supabase/migrations/0008_note_storage.sql) lets a signed-in student touch
 *      only the folder named after their own user id, so one student can never
 *      read another student's notes.
 *   2. The browser's IndexedDB vault — always written, so a note survives a
 *      refresh, a logout, or a network drop, and so the feature still works on a
 *      project where the storage bucket has not been created yet.
 *
 * The cloud copy is what makes notes follow the student across devices; the
 * device copy is what makes an upload impossible to lose. A note is only ever
 * reported as "saved to your account" after the object has been read back and
 * verified (never on a fire-and-forget upload).
 */

export const NOTES_BUCKET = 'student-notes';

export type CloudState = 'saved' | 'device-only';

export interface NoteMeta {
  id: string;
  name: string;
  size: number;
  mime: string;
  source: NoteSource;
  addedAt: number;
  /** Object path inside the bucket when a cloud copy exists. */
  path?: string;
  cloud: CloudState;
  /** Safe, non-technical explanation of why there is no cloud copy. */
  cloudNotice?: string;
}

function sanitizeForPath(name: string): string {
  return name
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'note';
}

export function noteObjectPath(userId: string, noteId: string, name: string): string {
  return `${userId}/${noteId}__${sanitizeForPath(name)}`;
}

/** The bucket's error text for the common "not configured yet" case. */
function describeStorageError(err: unknown): string {
  const text = String((err as { message?: string })?.message ?? err ?? '');
  if (/bucket.*not found|doesn't exist|not configured/i.test(text)) {
    return 'Supabase Storage bucket "student-notes" does not exist yet. Run supabase/migrations/0008_note_storage.sql (SETUP.md) to enable private cloud copies.';
  }
  if (/row-level security|policy|permission|not authorized|invalid scope/i.test(text)) {
    return 'Supabase Storage blocked this account from its own notes folder. The storage policies in SETUP.md need to be applied.';
  }
  if (/failed to fetch|networkerror|load failed|timeout/i.test(text)) {
    return 'No internet connection, so this note is kept on this device only for now.';
  }
  return text.slice(0, 160) || 'The cloud copy could not be created, so this note is kept on this device only.';
}

/**
 * Save one uploaded document: device copy first (never lose it), then the
 * student's private cloud copy, verified by reading the object back.
 */
export async function saveNote(userId: string, file: File, source: NoteSource): Promise<NoteMeta> {
  const noteId = `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const mime = guessMime(file.name, file.type);
  const path = noteObjectPath(userId, noteId, file.name);

  const meta: NoteMeta = {
    id: noteId,
    name: file.name,
    size: file.size,
    mime,
    source,
    addedAt: Date.now(),
    cloud: 'device-only',
  };

  // 1. Local vault write. If this fails the upload genuinely did not persist,
  //    so say so instead of pretending.
  const record: DeviceNoteRecord = {
    key: `${userId}/${noteId}`,
    userId,
    noteId,
    name: file.name,
    size: file.size,
    mime,
    source,
    addedAt: meta.addedAt,
    blob: file,
  };
  try {
    await putDeviceNote(record);
  } catch (err) {
    throw new Error(
      `This note could not be saved on this device (${String((err as { message?: string })?.message ?? err).slice(0, 100)}). Storage may be full or blocked.`,
    );
  }

  // 2. The student's private cloud copy.
  try {
    const storage = getSupabase().storage.from(NOTES_BUCKET);
    const { error } = await storage.upload(path, file, { contentType: mime, upsert: false });
    if (error) throw error;

    // 3. Verify the upload really landed before claiming it did.
    const { data: info, error: infoError } = await storage.info(path);
    if (infoError || !info) throw infoError ?? new Error('read-back failed');
    const reportedSize = (info as { metadata?: { size?: number } }).metadata?.size;
    if (typeof reportedSize === 'number' && reportedSize !== file.size) {
      throw new Error(`the stored copy is ${reportedSize} bytes but the upload was ${file.size} bytes`);
    }
    meta.cloud = 'saved';
    meta.path = path;
    // Remember where the cloud copy is, and keep the note readable offline.
    await putDeviceNote({ ...record, cloudPath: path }).catch(() => undefined);
  } catch (err) {
    meta.cloudNotice = describeStorageError(err);
    console.warn('[notes] cloud copy skipped:', meta.cloudNotice);
  }

  return meta;
}

/**
 * The account's notes: the device vault, topped up with any cloud copy that this
 * device has not seen yet (so notes follow the student between devices).
 */
export async function listNotes(userId: string): Promise<{ notes: NoteMeta[]; cloudNotice?: string }> {
  const local = await listDeviceNotes(userId);
  const notes: NoteMeta[] = local.map((r) => ({
    id: r.noteId,
    name: r.name,
    size: r.size,
    mime: r.mime,
    source: r.source,
    addedAt: r.addedAt,
    path: r.cloudPath,
    cloud: r.cloudPath ? 'saved' : 'device-only',
  }));

  const known = new Set(notes.map((n) => n.id));

  let notice: string | undefined;
  try {
    const storage = getSupabase().storage.from(NOTES_BUCKET);
    const { data, error } = await storage.list(`${userId}/`);
    if (error) throw error;
    for (const object of data ?? []) {
      const noteId = object.name.split('__')[0];
      if (!noteId || known.has(noteId)) continue;
      const { data: blob, error: downError } = await storage.download(`${userId}/${object.name}`);
      if (downError || !blob) continue;
      const name = object.name.slice(noteId.length + 2).replace(/-/g, ' ') || object.name;
      const mime = guessMime(name, blob.type);
      const addedAt = Date.parse(object.created_at ?? '') || Date.now();
      const path = `${userId}/${object.name}`;
      await putDeviceNote({
        key: `${userId}/${noteId}`,
        userId,
        noteId,
        name,
        size: blob.size,
        mime,
        source: 'pdf',
        addedAt,
        blob,
        cloudPath: path,
      });
      notes.push({ id: noteId, name, size: blob.size, mime, source: 'pdf', addedAt, path, cloud: 'saved' });
      known.add(noteId);
    }
    // An empty folder is also what a project WITHOUT the bucket looks like, so
    // say which of the two it is — otherwise the student is promised a cloud copy
    // that can never appear, and the reason only shows once right after an upload.
    if ((data ?? []).length === 0) {
      const probe = await getSupabase().storage.getBucket(NOTES_BUCKET);
      if (probe.error) notice = describeStorageError(probe.error);
    }
  } catch (err) {
    // A missing bucket is an admin setup issue, not a reason to hide the notes
    // this device already holds.
    return { notes: notes.sort((a, b) => b.addedAt - a.addedAt), cloudNotice: describeStorageError(err) };
  }

  return { notes: notes.sort((a, b) => b.addedAt - a.addedAt), cloudNotice: notice };
}

/** Rebuild a File for summarizing: from the cloud when present, else the vault. */
export async function loadNoteFile(userId: string, meta: NoteMeta): Promise<File> {
  const record = await getDeviceNote(userId, meta.id);
  if (record?.blob) {
    return new File([record.blob], meta.name, { type: meta.mime, lastModified: meta.addedAt });
  }
  if (meta.path) {
    const storage = getSupabase().storage.from(NOTES_BUCKET);
    const { data, error } = await storage.download(meta.path);
    if (error || !data) throw new Error('This note could not be downloaded from your account. Please upload it again.');
    return new File([data], meta.name, { type: meta.mime });
  }
  throw new Error('This note is no longer available. Please upload it again.');
}

export async function removeNote(userId: string, noteId: string, knownPath?: string): Promise<void> {
  // The vault record is what knows where the cloud copy lives, so look it up
  // before deleting it — otherwise a student's file would stay in Storage after
  // they removed it from the app.
  const record = await getDeviceNote(userId, noteId);
  const path = knownPath ?? record?.cloudPath;
  await deleteDeviceNote(userId, noteId).catch(() => undefined);
  if (path) {
    try {
      const storage = getSupabase().storage.from(NOTES_BUCKET);
      const { error } = await storage.remove([path]);
      if (error) console.warn('[notes] cloud delete skipped:', describeStorageError(error));
    } catch (err) {
      console.warn('[notes] cloud delete skipped:', describeStorageError(err));
    }
  }
}
