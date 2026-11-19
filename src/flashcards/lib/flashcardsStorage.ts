import type { FlashcardDeck } from '../types';

/**
 * Persistence for saved flashcard decks.
 *
 * Stored in localStorage, namespaced per signed-in user id, so each student can
 * only ever read their OWN decks and they survive reloads. (On-device for now —
 * a Supabase table + RLS is the cross-device upgrade path.)
 */

const storageKey = (userId: string) => `studysmart.flashcardDecks.${userId}`;

/** Cap so a large library can never overflow storage. */
export const MAX_FLASHCARD_DECKS = 50;

export function loadFlashcardDecks(userId: string): FlashcardDeck[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FlashcardDeck[]) : [];
  } catch {
    return [];
  }
}

/** Returns false when the write failed (e.g. storage full / blocked). */
export function persistFlashcardDecks(userId: string, decks: FlashcardDeck[]): boolean {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

export function makeDeckId(): string {
  return `deck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
