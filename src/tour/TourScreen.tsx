import { useEffect, useRef } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  LogoIcon,
  XIcon,
} from '../components/icons';
import { useI18n } from '../i18n/LanguageProvider';
import { useNotes } from '../summarize/NotesProvider';
import type { StudyTour } from './useStudyTour';

/**
 * The full-screen "How it works" tutorial.
 *
 * One step per screen, the whole window, nothing else competing for attention —
 * then the app is handed over on the screen the student actually needs first.
 * Arrow keys drive it as well, and Escape always gets out.
 */
export function TourScreen({ tour }: { tour: StudyTour }) {
  const { t, tList } = useI18n();
  const titles = tList('tour.titles');
  const bodies = tList('tour.bodies');
  const { step, index, total, isFirst, isLast } = tour;
  const Icon = step.Icon;
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Steps 3, 5 and 6 talk about selecting notes. A student who has not uploaded
  // anything yet cannot do any of it, so say what to do first rather than let
  // them hunt for a control that is not there.
  const { notes } = useNotes();
  const showEmptyHint = Boolean(step.needsNotes) && notes.length === 0;

  // Move focus into the tutorial and start each step at the top of the panel.
  useEffect(() => {
    panelRef.current?.focus();
    scrollRef.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') tour.stop();
      else if (event.key === 'ArrowRight') tour.goNext();
      else if (event.key === 'ArrowLeft') tour.goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour]);

  return (
    <div ref={scrollRef} className="fixed inset-0 z-50 overflow-y-auto bg-brand-navy">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.eyebrow')}
        className="mx-auto flex min-h-full max-w-xl flex-col px-5 py-6 outline-none sm:px-8 sm:py-10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-white">
              <LogoIcon width={18} height={18} />
            </span>
            <span className="font-serif text-lg font-bold text-white">StudySmart</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={tour.stop}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {t('tour.skip')}
            </button>
            <button
              type="button"
              onClick={tour.stop}
              aria-label={t('common.close')}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <XIcon width={16} height={16} />
            </button>
          </div>
        </div>

        <div className="mt-10 flex-1 sm:mt-14">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">
            {t('tour.step')} {index + 1} {t('tour.of')} {total}
          </p>

          {Icon && (
            <span className="mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-teal-300 ring-1 ring-inset ring-white/15">
              <Icon width={26} height={26} />
            </span>
          )}

          <h2 className="mt-6 font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
            {titles[index] ?? ''}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-200 sm:text-lg">
            {bodies[index] ?? ''}
          </p>

          {index === 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner ring-1 ring-inset ring-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-300">How it works</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  'Upload your notes',
                  'Summarize them',
                  'Turn them into flashcards',
                  'Practice and improve',
                ].map((label, stepIndex) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2 text-left text-sm text-slate-100 ring-1 ring-inset ring-white/10">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-xs font-bold text-teal-200">
                      {stepIndex + 1}
                    </span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showEmptyHint && (
            <p className="mt-6 rounded-xl bg-white/10 px-4 py-3 text-sm leading-relaxed text-slate-200 ring-1 ring-inset ring-white/15">
              {t('tour.emptyHint')}
            </p>
          )}

          <div className="mt-8 flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={
                  i === index
                    ? 'h-1.5 w-6 rounded-full bg-teal-400 transition-all'
                    : i < index
                      ? 'h-1.5 w-1.5 rounded-full bg-teal-400/40 transition-all'
                      : 'h-1.5 w-1.5 rounded-full bg-white/20 transition-all'
                }
              />
            ))}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between gap-3">
          {isFirst ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={tour.goBack}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <ArrowLeftIcon width={16} height={16} /> {t('common.back')}
            </button>
          )}
          {/* teal-600 rather than the site's teal-500: white text on teal-500
              measures 2.5:1, and this is the one button a student cannot miss. */}
          <button
            type="button"
            onClick={tour.goNext}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500"
          >
            {isLast ? (
              <>
                <CheckIcon width={16} height={16} /> {t('tour.startUsing')}
              </>
            ) : (
              <>
                {t('tour.next')} <ArrowRightIcon width={16} height={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
