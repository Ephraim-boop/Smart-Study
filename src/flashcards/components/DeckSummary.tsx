import { useMemo } from 'react';
import { RefreshIcon, TrophyIcon } from '../../components/icons';
import { useI18n } from '../../i18n/LanguageProvider';
import { type Flashcard, type ReviewStatus } from '../types';

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-center sm:p-5">
      <p className={`text-2xl font-bold ${tone} sm:text-3xl`}>{value}</p>
      <p className="mt-1 break-words text-[10px] font-semibold uppercase text-slate-500 sm:text-xs sm:tracking-wider">{label}</p>
    </div>
  );
}

export function DeckSummary({
  cards,
  progress,
  onPractiseDifficult,
  onStudyAgain,
  onViewDecks,
}: {
  cards: Flashcard[];
  progress: Record<string, ReviewStatus>;
  onPractiseDifficult: (difficultCards: Flashcard[]) => void;
  onStudyAgain: () => void;
  onViewDecks: () => void;
}) {
  const { t } = useI18n();
  const { gotIt, needPractice, dontKnow, difficult } = useMemo(() => {
    let gotIt = 0;
    let needPractice = 0;
    let dontKnow = 0;
    const difficult: Flashcard[] = [];
    for (const c of cards) {
      const s = progress[c.id];
      if (s === 'got_it') gotIt += 1;
      else if (s === 'need_practice') {
        needPractice += 1;
        difficult.push(c);
      } else if (s === 'dont_know') {
        dontKnow += 1;
        difficult.push(c);
      }
    }
    return { gotIt, needPractice, dontKnow, difficult };
  }, [cards, progress]);

  const reviewed = gotIt + needPractice + dontKnow;
  const rememberedPct = reviewed ? Math.round((gotIt / reviewed) * 100) : 0;

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-8">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <TrophyIcon width={22} height={22} />
        </span>
        <div className="min-w-0">
          <h2 className="break-words font-serif text-xl font-bold text-brand-navy sm:text-2xl">{t('flashcards.sessionComplete')}</h2>
          <p className="break-words text-slate-500">{t('flashcards.sessionCompleteHint')}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('flashcards.statReviewed')} value={reviewed} tone="text-brand-navy" />
        <Stat label={t('flashcards.statGotIt')} value={gotIt} tone="text-emerald-600" />
        <Stat label={t('flashcards.statNeedPractice')} value={needPractice} tone="text-amber-600" />
        <Stat label={t('flashcards.statDontKnow')} value={dontKnow} tone="text-rose-600" />
      </div>

      {/* Overall progress */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-brand-navy">{t('flashcards.overallProgress')}</span>
          <span className="text-slate-500">{t('flashcards.pctRemembered').replace('{n}', String(rememberedPct))}</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${rememberedPct}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {t('flashcards.savedForRevision').replace('{n}', String(difficult.length))}
        </p>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onPractiseDifficult(difficult)}
          disabled={difficult.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshIcon width={16} height={16} />
          {difficult.length > 0
            ? t('flashcards.practiseDifficultCount').replace('{n}', String(difficult.length))
            : t('flashcards.practiseDifficult')}
        </button>
        <button
          type="button"
          onClick={onStudyAgain}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-50"
        >
          {t('flashcards.studyAgain')}
        </button>
        <button
          type="button"
          onClick={onViewDecks}
          className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
        >
          {t('flashcards.backToDecks')}
        </button>
      </div>
    </div>
  );
}
