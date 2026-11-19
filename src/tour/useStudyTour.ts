import { useCallback, useMemo, useState } from 'react';
import { TOUR_ENTRY_VIEW, TOUR_STEPS, type TourStep, type TourView } from './tourSteps';

export interface StudyTour {
  /** True while the tutorial takes over the screen. */
  active: boolean;
  /** Zero-based index of the step being shown. */
  index: number;
  step: TourStep;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  /** Opens the tutorial on step 1. */
  start: () => void;
  goNext: () => void;
  goBack: () => void;
  /** Ends the tutorial and hands the student the app, ready for their first task. */
  finish: () => void;
  /** Closes the tutorial early (Skip / X / Escape) and goes back home. */
  stop: () => void;
}

/**
 * Drives the full-screen "How it works" tutorial.
 *
 * The tutorial owns the whole window while it is open, so it does not touch the
 * app's navigation at all — pressing Next only changes the step. Where the
 * student ends up is deliberately split in two: finishing drops them on the
 * Upload notes screen (the first real thing to do), while skipping or pressing
 * Escape returns them to the page they came from, because an unwanted tutorial
 * should leave no trace.
 */
export function useStudyTour(navigate: (view: TourView) => void): StudyTour {
  // null = closed.
  const [index, setIndex] = useState<number | null>(null);

  const start = useCallback(() => setIndex(0), []);

  const stop = useCallback(() => {
    setIndex(null);
    navigate('landing');
  }, [navigate]);

  const finish = useCallback(() => {
    setIndex(null);
    navigate(TOUR_ENTRY_VIEW);
  }, [navigate]);

  const goNext = useCallback(() => {
    if (index === null) return;
    if (index >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    setIndex(index + 1);
  }, [index, finish]);

  const goBack = useCallback(() => {
    if (index === null || index === 0) return;
    setIndex(index - 1);
  }, [index]);

  const active = index !== null;
  const safeIndex = index ?? 0;

  return useMemo(
    () => ({
      active,
      index: safeIndex,
      step: TOUR_STEPS[safeIndex],
      total: TOUR_STEPS.length,
      isFirst: safeIndex === 0,
      isLast: safeIndex === TOUR_STEPS.length - 1,
      start,
      goNext,
      goBack,
      finish,
      stop,
    }),
    [active, safeIndex, start, goNext, goBack, finish, stop],
  );
}
