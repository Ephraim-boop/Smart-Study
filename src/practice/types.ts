/**
 * Practice & Improve — shared types.
 *
 * Single source of truth for the AI practice contract, used by the browser and
 * mirrored by the secure backend (server/summarizeServer.mjs and the Supabase
 * Edge Functions). Questions are always generated from the student's OWN notes.
 */

import { AiError, type AiErrorCode } from '../ai/aiErrors';

export type PracticeMode = 'mc' | 'tf' | 'sa' | 'mixed';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'mc' | 'tf' | 'sa';

/** A single AI-generated question. Only the fields for its `type` are present. */
export interface PracticeQuestion {
  id: string;
  type: QuestionType;
  question: string;
  /** Multiple choice: exactly 4 options, one correct. */
  options?: string[];
  correctIndex?: number;
  /** True / false: the correct verdict for the statement. */
  correct?: boolean;
  /** Short answer: the expected key points, used to grade. */
  answer?: string;
  explanation: string;
  topic?: string;
}

/** What the student submitted for one question. */
export interface StudentAnswer {
  selectedIndex?: number;
  booleanAnswer?: boolean;
  textAnswer?: string;
}

/** Request to generate a fresh set of questions from extracted note text. */
export interface GenerateRequest {
  text: string;
  mode: PracticeMode;
  count: number;
  difficulty: Difficulty;
  topic?: string;
  sourceName?: string;
}

/** Request to grade a free-text short answer on the secure backend. */
export interface GradeRequest {
  question: string;
  referenceAnswer: string;
  studentAnswer: string;
}

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

/**
 * One answered question, stored so a session can be reviewed and its missed
 * questions replayed later. Carries enough to rebuild the question without the
 * original notes.
 */
export interface AnswerRecord {
  questionId: string;
  type: QuestionType;
  question: string;
  topic?: string;
  student: StudentAnswer;
  isCorrect: boolean;
  explanation: string;
  // Answer key retained for "practice the ones you missed":
  options?: string[];
  correctIndex?: number;
  correct?: boolean;
  referenceAnswer?: string;
}

/** A finished practice session, saved to the student's history. */
export interface PracticeSessionResult {
  id: string;
  createdAt: number;
  mode: PracticeMode;
  difficulty: Difficulty;
  sourceNames: string[];
  topic?: string;
  total: number;
  correct: number;
  scorePercent: number;
  items: AnswerRecord[];
}

/** Per-topic accuracy breakdown derived from a finished session. */
export interface TopicPerformance {
  topic: string;
  correct: number;
  total: number;
  percent: number;
}

export const MODE_LABELS: Record<PracticeMode, string> = {
  mc: 'Multiple Choice',
  tf: 'True / False',
  sa: 'Short Answer',
  mixed: 'Mixed Practice',
};

export const MODE_DESCRIPTIONS: Record<PracticeMode, string> = {
  mc: 'Four options, one correct answer.',
  tf: 'Decide if each statement is true or false.',
  sa: 'Explain the concept in your own words.',
  mixed: 'A blend of every question type.',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const QUESTION_COUNTS = [5, 10, 15, 20] as const;

/** The choices behind a generated set of questions (shown in results/history). */
export interface SessionMeta {
  mode: PracticeMode;
  difficulty: Difficulty;
  sourceNames: string[];
  topic?: string;
}

/**
 * Normalized, user-safe error codes so the UI can branch honestly.
 * Shared with Smart Summarize / Flashcards (src/ai/aiErrors.ts) because all
 * three features call the same secure backend.
 */
export type PracticeErrorCode = AiErrorCode;

export class PracticeError extends AiError {
  constructor(message: string, code: AiErrorCode) {
    super(message, code);
    this.name = 'PracticeError';
  }
}
