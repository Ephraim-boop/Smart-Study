/**
 * Smart Summarize — shared types.
 *
 * Used by BOTH the browser (to render results) and the Supabase Edge Function
 * (which returns the structured summary). One source of truth for the AI
 * contract.
 */

import { AiError, type AiErrorCode } from '../ai/aiErrors';

export type SummaryLength = 'short' | 'medium' | 'detailed';

export type SummaryLanguage = 'en' | 'fr';

/** The structured summary the AI must return, per the product spec (§3). */
export interface SummaryResult {
  /** A flowing prose overview of the whole document. */
  mainSummary: string;
  keyPoints: string[];
  definitions: { term: string; definition: string }[];
  /** Important facts, dates, formulas and concepts explicitly present. */
  facts: string[];
  /** Topic-by-topic explanations. */
  topics: { title: string; explanation: string }[];
  revisionTips: string[];
}

export interface SummarizeRequest {
  /** The extracted plain text of the student's notes. */
  text: string;
  length: SummaryLength;
  language: SummaryLanguage;
  /** Optional display name of the source, for the model's context only. */
  sourceName?: string;
}

/**
 * Normalized, user-safe error codes so the UI can branch honestly.
 *
 * Shared with Practice and Flashcards (see src/ai/aiErrors.ts): all three
 * features talk to the same secure backend, so a failure has to carry the SAME
 * code no matter which screen it came from. Each code has its own translation,
 * which is why the old collapsed `unknown`-for-everything list is gone.
 */

export type SummarizeErrorCode = AiErrorCode;

export class SummarizeError extends AiError {
  constructor(message: string, code: AiErrorCode) {
    super(message, code);
    this.name = 'SummarizeError';
  }
}

export const LENGTH_LABELS: Record<SummaryLength, string> = {
  short: 'Short',
  medium: 'Medium',
  detailed: 'Detailed',
};

export const LANGUAGE_LABELS: Record<SummaryLanguage, string> = {
  en: 'English',
  fr: 'French',
};
