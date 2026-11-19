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
  MAX_FLASHCARD_DECKS,
  loadFlashcardDecks,
  persistFlashcardDecks,
} from './lib/flashcardsStorage';
import type { FlashcardDeck, ReviewStatus } from './types';

/**
 * Holds the signed-in student's saved flashcard decks and keeps them in
 * localStorage (namespaced per account) so decks can be reopened, renamed,
 * deleted and their review progress preserved between sessions.
 */
interface FlashcardsValue {
  /** Newest first. */
  decks: FlashcardDeck[];
  count: number;
  /** True when a save/delete could not be persisted (storage blocked/full). */
  storageBlocked: boolean;
  getDeck: (id: string) => FlashcardDeck | undefined;
  /** Insert or replace a deck by id (newest first, capped). */
  saveDeck: (deck: FlashcardDeck) => void;
  renameDeck: (id: string, title: string) => void;
  /** Merge new review statuses into a deck's saved progress. */
  recordProgress: (id: string, progress: Record<string, ReviewStatus>) => void;
  removeDeck: (id: string) => void;
  clear: () => void;
}

const FlashcardsContext = createContext<FlashcardsValue | null>(null);

export function FlashcardsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    if (!userId) {
      setDecks([]);
      return;
    }
    setDecks(loadFlashcardDecks(userId));
  }, [userId]);

  const commit = useCallback(
    (next: FlashcardDeck[]) => {
      setDecks(next);
      if (userId) setStorageBlocked(!persistFlashcardDecks(userId, next));
    },
    [userId],
  );

  const getDeck = useCallback(
    (id: string) => decks.find((d) => d.id === id),
    [decks],
  );

  const saveDeck = useCallback<FlashcardsValue['saveDeck']>(
    (deck) => {
      if (!userId) return;
      const existing = loadFlashcardDecks(userId);
      const others = existing.filter((d) => d.id !== deck.id);
      commit([deck, ...others].slice(0, MAX_FLASHCARD_DECKS));
    },
    [userId, commit],
  );

  const renameDeck = useCallback(
    (id: string, title: string) => {
      if (!userId) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      commit(
        loadFlashcardDecks(userId).map((d) =>
          d.id === id ? { ...d, title: trimmed, updatedAt: Date.now() } : d,
        ),
      );
    },
    [userId, commit],
  );

  const recordProgress = useCallback(
    (id: string, progress: Record<string, ReviewStatus>) => {
      if (!userId) return;
      commit(
        loadFlashcardDecks(userId).map((d) =>
          d.id === id
            ? { ...d, progress: { ...d.progress, ...progress }, updatedAt: Date.now() }
            : d,
        ),
      );
    },
    [userId, commit],
  );

  const removeDeck = useCallback(
    (id: string) => {
      if (!userId) return;
      commit(loadFlashcardDecks(userId).filter((d) => d.id !== id));
    },
    [userId, commit],
  );

  const clear = useCallback(() => {
    if (!userId) return;
    commit([]);
  }, [userId, commit]);

  const value = useMemo<FlashcardsValue>(
    () => ({
      decks,
      count: decks.length,
      storageBlocked,
      getDeck,
      saveDeck,
      renameDeck,
      recordProgress,
      removeDeck,
      clear,
    }),
    [decks, storageBlocked, getDeck, saveDeck, renameDeck, recordProgress, removeDeck, clear],
  );

  return <FlashcardsContext.Provider value={value}>{children}</FlashcardsContext.Provider>;
}

export function useFlashcards(): FlashcardsValue {
  const ctx = useContext(FlashcardsContext);
  if (!ctx) throw new Error('useFlashcards must be used within a FlashcardsProvider.');
  return ctx;
}
