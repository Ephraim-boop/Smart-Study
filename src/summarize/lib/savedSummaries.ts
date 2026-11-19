import type { SummaryLanguage, SummaryLength, SummaryResult } from '../types';

/**
 * A Smart Summarize result the student has kept to review later.
 *
 * Stored in localStorage, namespaced per signed-in user id, so summaries
 * survive reloads and stay separated between accounts on the same device.
 * (Kept on-device for now — not synced across devices.)
 */
export interface SavedSummary {
  id: string;
  /** Human label, derived from the source note name(s). */
  title: string;
  sourceNames: string[];
  result: SummaryResult;
  length: SummaryLength;
  language: SummaryLanguage;
  /** Epoch milliseconds when it was saved. */
  savedAt: number;
}

const storageKey = (userId: string) => `studysmart.savedSummaries.${userId}`;

/** Safety cap so localStorage can never be filled without bound. */
export const MAX_SAVED_SUMMARIES = 100;

export function loadSavedSummaries(userId: string): SavedSummary[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedSummary[]) : [];
  } catch {
    return [];
  }
}

/** Returns false when the write failed (e.g. storage full / blocked). */
export function persistSavedSummaries(userId: string, items: SavedSummary[]): boolean {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function makeSavedId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleForSources(sourceNames: string[]): string {
  const clean = sourceNames.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return 'Summary';
  if (clean.length === 1) return clean[0];
  return `${clean[0]} + ${clean.length - 1} more`;
}
