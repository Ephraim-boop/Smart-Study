/**
 * Flashcards — shared types.
 *
 * Single source of truth for the AI flashcard contract, mirrored by the secure
 * backend (server/summarizeServer.mjs and the Supabase Edge Function). Cards are
 * always generated from the student's OWN notes.
 */

import { AiError, type AiErrorCode } from '../ai/aiErrors';

export type FlashcardDifficulty = 'easy' | 'medium' | 'hard';

/** How the student rated a card after flipping it. */
export type ReviewStatus = 'got_it' | 'need_practice' | 'dont_know';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic?: string;
  difficulty: FlashcardDifficulty;
}

export interface GenerateFlashcardsRequest {
  text: string;
  count: number;
  difficulty?: FlashcardDifficulty;
  topic?: string;
  sourceName?: string;
}

/** A saved deck the student can reopen, rename, delete and keep progress on. */
export interface FlashcardDeck {
  id: string;
  title: string;
  sourceNames: string[];
  cards: Flashcard[];
  createdAt: number;
  updatedAt: number;
  /** cardId -> last review status; preserved between sessions. */
  progress: Record<string, ReviewStatus>;
}

export const DIFFICULTY_LABELS: Record<FlashcardDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const DECK_COUNTS = [10, 20, 30] as const;

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  got_it: 'Got It',
  need_practice: 'Need Practice',
  dont_know: "Don't Know Yet",
};

/** Cards that should be prioritised for extra revision. */
export const DIFFICULT_STATUSES: ReviewStatus[] = ['need_practice', 'dont_know'];

/**
 * Normalized, user-safe error codes so the UI can branch honestly.
 * Shared with Smart Summarize / Practice (src/ai/aiErrors.ts) because all three
 * features call the same secure backend.
 */
export type FlashcardsErrorCode = AiErrorCode;

export class FlashcardsError extends AiError {
  constructor(message: string, code: AiErrorCode) {
    super(message, code);
    this.name = 'FlashcardsError';
  }
}
