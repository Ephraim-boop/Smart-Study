import type { AccessState } from '../types/subscription';

/**
 * Premium-gated feature catalog (Section 5 of the brief).
 * The keys are also used by backend policies / server functions so that a
 * locked feature cannot be invoked directly — the UI lock is only a hint.
 */
export type PremiumFeature =
  | 'advanced_note_analyzer'
  | 'advanced_question_generator'
  | 'mock_examination'
  | 'advanced_ai_tutor'
  | 'weakness_detection'
  | 'study_planner'
  | 'spaced_repetition'
  | 'advanced_progress_analytics';

export interface PremiumFeatureMeta {
  key: PremiumFeature;
  titleEn: string;
  titleFr: string;
}

export const PREMIUM_FEATURES: PremiumFeatureMeta[] = [
  { key: 'advanced_note_analyzer', titleEn: 'Advanced AI Note Analyzer', titleFr: 'Analyseur de notes IA avancé' },
  { key: 'advanced_question_generator', titleEn: 'Advanced Question Generator', titleFr: 'Générateur de questions avancé' },
  { key: 'mock_examination', titleEn: 'Full Mock Examinations', titleFr: 'Examens blancs complets' },
  { key: 'advanced_ai_tutor', titleEn: 'Advanced AI Tutor', titleFr: 'Tuteur IA avancé' },
  { key: 'weakness_detection', titleEn: 'Weakness Detection', titleFr: 'Détection des lacunes' },
  { key: 'study_planner', titleEn: 'Personalized Study Planner', titleFr: 'Planificateur d’études personnalisé' },
  { key: 'spaced_repetition', titleEn: 'Advanced Flashcards & Spaced Repetition', titleFr: 'Flashcards avancées & répétition espacée' },
  { key: 'advanced_progress_analytics', titleEn: 'Advanced Progress Analytics', titleFr: 'Analytique de progression avancée' },
];

/**
 * Frontend access decision. Returns true only when the subscription is
 * currently active. Callers must ALSO verify server-side before performing a
 * premium operation; this function is not a security boundary.
 */
export function canAccessPremium(access: AccessState, _feature: PremiumFeature): boolean {
  return access.isPremium;
}

/**
 * Build the "subscribe to unlock" message shown when a locked feature is hit.
 * Deliberately avoids deleting or hiding the user's existing work.
 */
export function lockMessage(language: 'en' | 'fr'): string {
  return language === 'fr'
    ? 'Cette fonctionnalité est réservée aux abonnés. Souscrivez pour la débloquer — votre travail enregistré est conservé.'
    : 'This feature is for subscribers. Subscribe to unlock it — your saved work is always kept.';
}
