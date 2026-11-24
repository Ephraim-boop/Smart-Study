import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RefreshIcon,
  ShuffleIcon,
  XIcon,
} from '../../components/icons';
import { useI18n } from '../../i18n/LanguageProvider';
import {
  type Flashcard,
  type FlashcardDifficulty,
  type ReviewStatus,
} from '../types';

const DIFF_BADGE: Record<FlashcardDifficulty, string> = {
  easy: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  hard: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function shuffled(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function FlashcardDeck({
  cards,
  savedProgress,
  title,
  onFinish,
}: {
  cards: Flashcard[];
  savedProgress: Record<string, ReviewStatus>;
  title: string;
  onFinish: (progress: Record<string, ReviewStatus>) => void;
}) {
  const { t } = useI18n();
  const originalOrder = useMemo(() => cards.map((c) => c.id), [cards]);
  const [order, setOrder] = useState<string[]>(originalOrder);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [progress, setProgress] = useState<Record<string, ReviewStatus>>({ ...savedProgress });
  const [confirmExit, setConfirmExit] = useState(false);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const current = byId.get(order[index]);

  const reviewedCount = useMemo(
    () => order.filter((id) => progress[id]).length,
    [order, progress],
  );

  const goPrev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.min(order.length - 1, i + 1));
  }, [order.length]);

  function mark(status: ReviewStatus) {
    if (!current) return;
    const next = { ...progress, [current.id]: status };
    setProgress(next);
    if (index < order.length - 1) {
      setFlipped(false);
      setIndex((i) => i + 1);
    } else {
      // Finished the last card — go straight to the summary.
      onFinish(next);
    }
  }

  function shuffle() {
    setOrder((o) => shuffled(o));
    setIndex(0);
    setFlipped(false);
  }

  function restart() {
    setOrder(originalOrder);
    setIndex(0);
    setFlipped(false);
  }

  if (!current) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        {t('flashcards.noCards')}
      </div>
    );
  }

  const status = progress[current.id];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-xl font-bold text-brand-navy">{title}</h2>
          <p className="text-sm text-slate-500">
            {t('flashcards.cardProgress').replace('{n}', String(index + 1)).replace('{total}', String(order.length))} · {t('flashcards.reviewedCount').replace('{n}', String(reviewedCount))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={shuffle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-navy transition hover:bg-slate-50"
          >
            <ShuffleIcon width={15} height={15} /> {t('flashcards.shuffle')}
          </button>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-navy transition hover:bg-slate-50"
          >
            <RefreshIcon width={15} height={15} /> {t('flashcards.restart')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          >
            <XIcon width={15} height={15} /> {t('flashcards.exit')}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-500 transition-all"
          style={{ width: `${order.length ? ((index + 1) / order.length) * 100 : 0}%` }}
        />
      </div>

      {/* Flip card */}
      <div className="mt-6 [perspective:1600px]">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? t('flashcards.showQuestion') : t('flashcards.flipAnswer')}
          className={`relative block h-[320px] w-full cursor-pointer rounded-2xl text-left transition-transform duration-500 [transform-style:preserve-3d] sm:h-[360px] ${
            flipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm [backface-visibility:hidden] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-600">{t('flashcards.questionLabel')}</span>
              <div className="flex items-center gap-2">
                {current.topic && (
                  <span className="max-w-full break-words rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {current.topic}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${DIFF_BADGE[current.difficulty]}`}>
                  {t(`flashcards.difficultyLabels.${current.difficulty}`)}
                </span>
              </div>
            </div>
            <p className="flex-1 overflow-auto py-4 font-serif text-xl font-semibold leading-relaxed text-brand-navy sm:text-2xl">
              {current.front}
            </p>
            <p className="text-center text-sm text-slate-400">{t('flashcards.tapReveal')}</p>
          </div>

          {/* Back */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-teal-200 bg-teal-50/60 p-6 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-8">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">{t('flashcards.answerLabel')}</span>
            <p className="flex-1 overflow-auto py-4 text-lg leading-relaxed text-brand-navy">{current.back}</p>
            <p className="text-center text-sm text-teal-700/70">{t('flashcards.tapQuestion')}</p>
          </div>
        </button>
      </div>

      {/* Review options — only after flipping */}
      <div className="mt-6">
        {flipped ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <ReviewButton
              status="dont_know"
              active={status === 'dont_know'}
              className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              onClick={() => mark('dont_know')}
            />
            <ReviewButton
              status="need_practice"
              active={status === 'need_practice'}
              className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              onClick={() => mark('need_practice')}
            />
            <ReviewButton
              status="got_it"
              active={status === 'got_it'}
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              onClick={() => mark('got_it')}
            />
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400">{t('flashcards.revealToMark')}</p>
        )}
      </div>

      {/* Nav */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeftIcon width={16} height={16} /> {t('flashcards.previous')}
        </button>

        {index === order.length - 1 ? (
          <button
            type="button"
            onClick={() => onFinish(progress)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <CheckIcon width={16} height={16} /> {t('flashcards.finishSession')}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition hover:bg-slate-50"
          >
            {t('flashcards.next')} <ArrowRightIcon width={16} height={16} />
          </button>
        )}
      </div>

      {confirmExit && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-sm text-slate-600">{t('flashcards.leaveConfirm')}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmExit(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50"
            >
              {t('flashcards.keepStudying')}
            </button>
            <button
              type="button"
              onClick={() => onFinish(progress)}
              className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {t('flashcards.saveExit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewButton({
  status,
  active,
  className,
  onClick,
}: {
  status: ReviewStatus;
  active: boolean;
  className: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${className} ${
        active ? 'ring-2 ring-offset-1 ring-brand-navy' : ''
      }`}
    >
      {t(`flashcards.reviewLabels.${status}`)}
    </button>
  );
}
