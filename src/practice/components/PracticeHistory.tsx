import { useState } from 'react';
import { ChartIcon, HistoryIcon, RefreshIcon, TrashIcon } from '../../components/icons';
import { usePractice } from '../PracticeProvider';
import { useI18n } from '../../i18n/LanguageProvider';
import { missedToQuestions, formatDate } from '../lib/practiceAnalysis';
import { type PracticeSessionResult } from '../types';

function scoreTone(percent: number): string {
  if (percent >= 80) return 'bg-teal-500';
  if (percent >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

/** Simple dependency-free bar chart of recent scores (oldest → newest). */
function ScoreChart({ sessions }: { sessions: PracticeSessionResult[] }) {
  const { t } = useI18n();
  const recent = [...sessions].slice(0, 12).reverse();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <h3 className="flex flex-wrap items-center gap-2 font-serif text-lg font-bold text-brand-navy">
        <span className="text-teal-600"><ChartIcon width={18} height={18} /></span> {t('practice.scoreOverTime')}
      </h3>
      <div className="mt-6 flex h-40 items-end gap-2">
        {recent.map((s) => (
          <div key={s.id} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium text-slate-400">{s.scorePercent}%</span>
            <div
              className={`w-full max-w-[2.5rem] rounded-t-md ${scoreTone(s.scorePercent)}`}
              style={{ height: `${Math.max(6, s.scorePercent)}%` }}
              title={`${s.scorePercent}% · ${formatDate(s.createdAt)}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 h-px w-full bg-slate-200" />
      <p className="mt-2 text-xs text-slate-400">{t('practice.lastSessions').replace('{n}', String(recent.length))}</p>
    </div>
  );
}

function SessionCard({
  session,
  onRetry,
  onDelete,
}: {
  session: PracticeSessionResult;
  onRetry: (questions: ReturnType<typeof missedToQuestions>, meta: PracticeSessionResult) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const missed = session.items.filter((i) => !i.isCorrect);
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-navy">
            {t(`practice.modes.${session.mode}`)} · {t(`practice.difficultyLabels.${session.difficulty}`)}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {formatDate(session.createdAt)} · {session.sourceNames.slice(0, 2).join(', ')}
            {session.sourceNames.length > 2 ? ` ${t('practice.moreCount').replace('{n}', String(session.sourceNames.length - 2))}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-bold text-brand-navy">{session.scorePercent}%</p>
            <p className="text-xs text-slate-500">
              {t('practice.nCorrect').replace('{c}', String(session.correct)).replace('{t}', String(session.total))}
            </p>
          </div>
          <span className={`h-10 w-1.5 rounded-full ${scoreTone(session.scorePercent)}`} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {missed.length > 0 && (
          <button
            type="button"
            onClick={() => onRetry(missedToQuestions(session.items), session)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
          >
            <RefreshIcon width={14} height={14} /> {t('practice.retryMissed').replace('{n}', String(missed.length))}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <TrashIcon width={14} height={14} /> {t('practice.delete')}
        </button>
      </div>
    </div>
  );
}

export function PracticeHistory({
  onBack,
  onRetry,
}: {
  onBack: () => void;
  onRetry: (questions: ReturnType<typeof missedToQuestions>, meta: PracticeSessionResult) => void;
}) {
  const { history, remove, clear, storageBlocked } = usePractice();
  const { t } = useI18n();
  const [confirmClear, setConfirmClear] = useState(false);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <HistoryIcon width={22} height={22} />
        </span>
        <p className="mt-4 text-slate-500">{t('practice.noSessions')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('practice.noSessionsHint')}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {t('practice.backToPractice')}
        </button>
      </div>
    );
  }

  return (
    <div>
      {storageBlocked && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          {t('practice.storageBlocked')}
        </div>
      )}

      <div className="mb-6">
        <ScoreChart sessions={history} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words font-serif text-lg font-bold text-brand-navy">{`${t('practice.allAttempts')} (${history.length})`}</h3>
        <button
          type="button"
          onClick={() => {
            if (confirmClear) {
              clear();
              setConfirmClear(false);
            } else {
              setConfirmClear(true);
              window.setTimeout(() => setConfirmClear(false), 4000);
            }
          }}
          className="text-sm font-medium text-slate-500 transition hover:text-red-600"
        >
          {confirmClear ? t('practice.confirmClear') : t('practice.clearAll')}
        </button>
      </div>

      <div className="space-y-3">
        {history.map((s) => (
          <SessionCard key={s.id} session={s} onRetry={onRetry} onDelete={() => remove(s.id)} />
        ))}
      </div>
    </div>
  );
}
