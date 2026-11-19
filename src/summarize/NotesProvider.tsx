import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { isImage, validateNoteFile, type NoteSource, type UploadedNote } from '../upload/types';
import {
  listNotes,
  loadNoteFile,
  removeNote as removeStoredNote,
  saveNote,
  type NoteMeta,
} from '../upload/noteVault';

/**
 * Shared store for the notes a student has uploaded.
 *
 * REUSED by Smart Summarize, Practice and Flashcards so the very same files can
 * be used without uploading again.
 *
 * PERSISTENCE (this is what used to be broken)
 * Notes are no longer kept in React state alone. Every upload is written to the
 * student's own vault — Supabase Storage under their user id, plus a copy in this
 * browser (see src/upload/noteVault.ts) — and the list is re-read whenever the
 * signed-in user changes. A refresh, a logout, or opening the app on another
 * device therefore no longer deletes the student's notes, and a generated summary
 * can still be traced back to the document it came from. Records are keyed by the
 * signed-in user id, so one student's notes are never listed for another student.
 */

interface NotesContextValue {
  notes: UploadedNote[];
  /** Validation / storage problems from the most recent addFiles call. */
  errors: string[];
  /** True while notes are being read back at sign-in, or while an upload saves. */
  loading: boolean;
  saving: boolean;
  /** Safe explanation when a private cloud copy could not be made (admin setup). */
  cloudNotice: string | null;
  addFiles: (files: File[], source: NoteSource) => void;
  removeNote: (id: string) => void;
  clearAll: () => void;

  /** Note ids chosen for the Smart Summarize page. */
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;

  /** Ids that already have a generated summary (to avoid repeat prompts). */
  summarizedIds: Set<string>;
  markSummarized: (ids: string[]) => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

/** Build the in-memory note the rest of the app works with from a saved record. */
async function hydrateNote(userId: string, meta: NoteMeta): Promise<UploadedNote> {
  const file = await loadNoteFile(userId, meta);
  return {
    id: meta.id,
    file,
    name: meta.name,
    size: meta.size,
    mime: meta.mime,
    source: meta.source,
    previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
    addedAt: meta.addedAt,
  };
}

function failureText(err: unknown): string {
  return String((err as { message?: string })?.message ?? err).slice(0, 200);
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [notes, setNotes] = useState<UploadedNote[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [summarizedIds, setSummarizedIds] = useState<Set<string>>(() => new Set());

  // Revoke every object URL when the whole app unmounts.
  useEffect(() => {
    const current = notes;
    return () => current.forEach((n) => n.previewUrl && URL.revokeObjectURL(n.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read this account's notes back from the vault whenever the signed-in user
  // changes (sign-in, sign-out, switching account on a shared device).
  useEffect(() => {
    if (!userId) {
      setNotes((prev) => {
        prev.forEach((n) => n.previewUrl && URL.revokeObjectURL(n.previewUrl));
        return [];
      });
      setSelectedIds([]);
      setCloudNotice(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const { notes: metas, cloudNotice: notice } = await listNotes(userId);
        const hydrated: UploadedNote[] = [];
        for (const meta of metas) {
          try {
            hydrated.push(await hydrateNote(userId, meta));
          } catch (err) {
            // One unreadable copy must not hide the student's other notes.
            console.warn('[notes] could not open', meta.name, failureText(err));
          }
        }
        if (!active) {
          hydrated.forEach((n) => n.previewUrl && URL.revokeObjectURL(n.previewUrl));
          return;
        }
        setNotes(hydrated);
        setCloudNotice(notice ?? null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const addFiles = useCallback(
    (files: File[], source: NoteSource) => {
      const rejected: string[] = [];
      const acceptedFiles: File[] = [];
      for (const file of files) {
        const result = validateNoteFile(file);
        if (!result.ok) {
          rejected.push(`${file.name}: ${result.reason}`);
          continue;
        }
        acceptedFiles.push(file);
      }

      // Signed out (demo / setup screens): keep the old session-only behaviour.
      if (!userId) {
        const built = acceptedFiles.map((file) => ({
          id: `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          name: file.name,
          size: file.size,
          mime: file.type || (source === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          source,
          previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
          addedAt: Date.now(),
        }));
        if (built.length) setNotes((prev) => [...built, ...prev]);
        setErrors(rejected);
        return;
      }

      setSaving(true);
      void (async () => {
        const saved: UploadedNote[] = [];
        const failures: string[] = [...rejected];
        let notice: string | null = null;
        for (const file of acceptedFiles) {
          try {
            const meta = await saveNote(userId, file, source);
            saved.push(await hydrateNote(userId, meta));
            if (meta.cloudNotice) notice = meta.cloudNotice;
          } catch (err) {
            failures.push(`${file.name}: ${failureText(err)}`);
          }
        }
        if (saved.length) setNotes((prev) => [...saved, ...prev]);
        setErrors(failures);
        if (notice) setCloudNotice(notice);
      })().finally(() => setSaving(false));
    },
    [userId],
  );

  const removeNote = useCallback(
    (id: string) => {
      const target = notes.find((n) => n.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      // Deleting here must also delete the student's saved copy, otherwise the
      // file keeps living in their account after they removed it from the list.
      if (userId) void removeStoredNote(userId, id).catch(() => undefined);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    },
    [notes, userId],
  );

  const clearAll = useCallback(() => {
    notes.forEach((n) => n.previewUrl && URL.revokeObjectURL(n.previewUrl));
    if (userId) {
      for (const n of notes) void removeStoredNote(userId, n.id).catch(() => undefined);
    }
    setNotes([]);
    setSelectedIds([]);
  }, [notes, userId]);

  const markSummarized = useCallback((ids: string[]) => {
    setSummarizedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      errors,
      loading,
      saving,
      cloudNotice,
      addFiles,
      removeNote,
      clearAll,
      selectedIds,
      setSelectedIds,
      summarizedIds,
      markSummarized,
    }),
    [
      notes,
      errors,
      loading,
      saving,
      cloudNotice,
      addFiles,
      removeNote,
      clearAll,
      selectedIds,
      summarizedIds,
      markSummarized,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within a NotesProvider.');
  return ctx;
}
