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
import {
  MAX_SAVED_SUMMARIES,
  loadSavedSummaries,
  makeSavedId,
  persistSavedSummaries,
  titleForSources,
  type SavedSummary,
} from './lib/savedSummaries';
import type { SummaryLanguage, SummaryLength, SummaryResult } from './types';

/**
 * Holds the student's saved Smart Summarize results for the signed-in account
 * and keeps them in localStorage so they can be reviewed (and deleted) later.
 */
interface SavedSummariesValue {
  saved: SavedSummary[];
  count: number;
  /** True when a save/delete could not be persisted (storage blocked/full). */
  storageBlocked: boolean;
  add: (input: {
    result: SummaryResult;
    length: SummaryLength;
    language: SummaryLanguage;
    sourceNames: string[];
  }) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const SavedSummariesContext = createContext<SavedSummariesValue | null>(null);

export function SavedSummariesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  const [storageBlocked, setStorageBlocked] = useState(false);

  // (Re)load this account's saved summaries whenever the signed-in user changes.
  useEffect(() => {
    if (!userId) {
      setSaved([]);
      return;
    }
    setSaved(loadSavedSummaries(userId));
  }, [userId]);

  const commit = useCallback(
    (next: SavedSummary[]) => {
      setSaved(next);
      if (userId) setStorageBlocked(!persistSavedSummaries(userId, next));
    },
    [userId],
  );

  const add = useCallback<SavedSummariesValue['add']>(
    ({ result, length, language, sourceNames }) => {
      if (!userId) return;
      const item: SavedSummary = {
        id: makeSavedId(),
        title: titleForSources(sourceNames),
        sourceNames,
        result,
        length,
        language,
        savedAt: Date.now(),
      };
      // Read fresh from storage to avoid clobbering another tab's writes.
      const next = [item, ...loadSavedSummaries(userId)].slice(0, MAX_SAVED_SUMMARIES);
      commit(next);
    },
    [userId, commit],
  );

  const remove = useCallback(
    (id: string) => {
      if (!userId) return;
      commit(loadSavedSummaries(userId).filter((s) => s.id !== id));
    },
    [userId, commit],
  );

  const clear = useCallback(() => {
    if (!userId) return;
    commit([]);
  }, [userId, commit]);

  const value = useMemo<SavedSummariesValue>(
    () => ({ saved, count: saved.length, storageBlocked, add, remove, clear }),
    [saved, storageBlocked, add, remove, clear],
  );

  return <SavedSummariesContext.Provider value={value}>{children}</SavedSummariesContext.Provider>;
}

export function useSavedSummaries(): SavedSummariesValue {
  const ctx = useContext(SavedSummariesContext);
  if (!ctx) throw new Error('useSavedSummaries must be used within a SavedSummariesProvider.');
  return ctx;
}
