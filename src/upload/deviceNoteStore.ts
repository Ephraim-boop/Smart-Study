import type { NoteSource } from './types';

/**
 * On-device note vault (IndexedDB), used as the reliable local copy of a
 * student's uploaded documents.
 *
 * WHY THIS EXISTS
 * Uploaded notes used to live in React state only, so a page refresh deleted
 * them: the student lost the file, Smart Summarize showed an empty list, and a
 * generated summary could no longer be traced back to its notes. File objects
 * cannot go into localStorage, so the browser's own document store (IndexedDB)
 * is used. Records are keyed per signed-in user id, so one student's notes are
 * never listed for another student on a shared device.
 */

export interface DeviceNoteRecord {
  /** `${userId}/${noteId}` — the primary key. */
  key: string;
  userId: string;
  noteId: string;
  name: string;
  size: number;
  mime: string;
  source: NoteSource;
  addedAt: number;
  blob: Blob;
  /** Set once a verified copy exists in the student's Supabase Storage folder. */
  cloudPath?: string;
}

const DB_NAME = 'studysmart-notes';
const DB_VERSION = 1;
const STORE = 'notes';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('by-user', 'userId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the note vault.'));
    request.onblocked = () => reject(new Error('The note vault is blocked by another tab.'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Note vault operation failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Note vault transaction aborted.'));
      }),
  );
}

export function noteKey(userId: string, noteId: string): string {
  return `${userId}/${noteId}`;
}

/** Store (or replace) one note's bytes and metadata for this account. */
export async function putDeviceNote(record: DeviceNoteRecord): Promise<void> {
  await tx('readwrite', (store) => store.put(record));
}

/** Every note belonging to this user id, newest first. */
export async function listDeviceNotes(userId: string): Promise<DeviceNoteRecord[]> {
  try {
    const db = await openDb();
    return await new Promise<DeviceNoteRecord[]>((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const index = store.index('by-user');
      const request = index.getAll(IDBKeyRange.only(userId));
      request.onsuccess = () => {
        const rows = (request.result ?? []) as DeviceNoteRecord[];
        rows.sort((a, b) => b.addedAt - a.addedAt);
        resolve(rows);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the note vault.'));
    });
  } catch {
    return [];
  }
}

export async function getDeviceNote(userId: string, noteId: string): Promise<DeviceNoteRecord | null> {
  try {
    return (await tx<DeviceNoteRecord | undefined>('readonly', (store) => store.get(noteKey(userId, noteId)))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteDeviceNote(userId: string, noteId: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(noteKey(userId, noteId)));
}

/** True when this browser can actually keep notes (private mode can refuse). */
export async function deviceVaultAvailable(): Promise<boolean> {
  try {
    await tx('readonly', (store) => store.count());
    return true;
  } catch {
    return false;
  }
}
