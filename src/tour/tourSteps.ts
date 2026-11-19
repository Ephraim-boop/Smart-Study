import type { ComponentType, SVGProps } from 'react';
import {
  BookOpenIcon,
  ChartIcon,
  ListIcon,
  TrophyIcon,
  UploadIcon,
} from '../components/icons';

/**
 * Every screen the app can show. Mirrors the `View` union in App.tsx — the tour
 * hands the student back to the app when it ends, so the two lists have to stay
 * in step.
 */
export type TourView =
  | 'landing'
  | 'upload'
  | 'summarize'
  | 'saved'
  | 'practice'
  | 'flashcards';

export interface TourStep {
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * True when the step only makes sense for a student who already has notes.
   * The screen says so out loud instead of assuming they can see the controls.
   */
  needsNotes?: boolean;
}

/**
 * The full-screen "How it works" tutorial.
 *
 * It takes the whole window rather than sitting in a corner: a first-time
 * student is not yet oriented enough to read a tooltip while juggling the real
 * interface, so the explanation gets its own space and the app is handed back
 * only when the tutorial is over.
 *
 * The wording lives in the i18n dictionary (`tour.titles` / `tour.bodies`) and
 * MUST stay in this exact order: index i of each list belongs to step i.
 */
export const TOUR_STEPS: TourStep[] = [
  { Icon: BookOpenIcon },
  { Icon: UploadIcon },
  { Icon: ListIcon, needsNotes: true },
  { Icon: BookOpenIcon },
  { needsNotes: true },
  { Icon: ChartIcon, needsNotes: true },
  { Icon: TrophyIcon },
];

/** Where the student lands when they finish the tutorial: their first upload. */
export const TOUR_ENTRY_VIEW: TourView = 'upload';
