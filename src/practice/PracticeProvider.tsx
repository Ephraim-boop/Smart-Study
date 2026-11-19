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
  MAX_PRACTICE_SESSIONS,
  loadPracticeSessions,
  persistPracticeSessions,
} from './lib/practiceStorage';
import type { PracticeSessionResult } from './types';

/**
 * Holds the signed-in student's completed practice sessions and keeps them in
 * localStorage (namespaced per account) so scores can be tracked over time and
 * missed questions replayed. Nothing is fabricated — every record is a session
 * the student actually finished.
 */
interface PracticeValue {
  /** Newest first. */
  history: PracticeSessionResult[];
  count: number;
  /** True when a save/delete could not be persisted (storage blocked/full). */
  storageBlocked: boolean;
  add: (session: PracticeSessionResult) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const PracticeContext = createContext<PracticeValue | null>(null);

export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [history, setHistory] = useState<PracticeSessionResult[]>([]);
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHistory([]);
      return;
    }
    setHistory(loadPracticeSessions(userId));
  }, [userId]);

  const commit = useCallback(
    (next: PracticeSessionResult[]) => {
      setHistory(next);
      if (userId) setStorageBlocked(!persistPracticeSessions(userId, next));
    },
    [userId],
  );

  const add = useCallback<PracticeValue['add']>(
    (session) => {
      if (!userId) return;
      // Read fresh to avoid clobbering another tab's writes; newest first, capped.
      const next = [session, ...loadPracticeSessions(userId)].slice(0, MAX_PRACTICE_SESSIONS);
      commit(next);
    },
    [userId, commit],
  );

  const remove = useCallback(
    (id: string) => {
      if (!userId) return;
      commit(loadPracticeSessions(userId).filter((s) => s.id !== id));
    },
    [userId, commit],
  );

  const clear = useCallback(() => {
    if (!userId) return;
    commit([]);
  }, [userId, commit]);

  const value = useMemo<PracticeValue>(
    () => ({ history, count: history.length, storageBlocked, add, remove, clear }),
    [history, storageBlocked, add, remove, clear],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice(): PracticeValue {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error('usePractice must be used within a PracticeProvider.');
  return ctx;
}
