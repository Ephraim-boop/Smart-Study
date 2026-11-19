import type { PracticeSessionResult } from '../types';

/**
 * Persistence for completed practice sessions.
 *
 * Stored in localStorage, namespaced per signed-in user id, so each student can
 * only ever read their OWN history and it survives reloads. (On-device for now —
 * a Supabase table + RLS is the cross-device upgrade path.)
 */

const storageKey = (userId: string) => `studysmart.practiceSessions.${userId}`;

/** Cap so a long streak of sessions can never overflow storage. */
export const MAX_PRACTICE_SESSIONS = 60;

export function loadPracticeSessions(userId: string): PracticeSessionResult[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PracticeSessionResult[]) : [];
  } catch {
    return [];
  }
}

/** Returns false when the write failed (e.g. storage full / blocked). */
export function persistPracticeSessions(userId: string, items: PracticeSessionResult[]): boolean {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function makeSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
