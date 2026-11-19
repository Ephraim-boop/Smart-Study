import {
  ArrowRightIcon,
  CheckIcon,
  HistoryIcon,
  RefreshIcon,
  TargetIcon,
  TrophyIcon,
  XIcon,
} from '../../components/icons';
import { buildSuggestions, computeTopicPerformance, formatDate } from '../lib/practiceAnalysis';
import { useI18n } from '../../i18n/LanguageProvider';
import { MODE_LABELS, type PracticeSessionResult } from '../types';

function Stat({ label, value, tone }: { label: string; value: string; tone: 'navy' | 'blue' | 'red' }) {
  const color = tone === 'blue' ? 'text-blue-600' : tone === 'red' ? 'text-red-500' : 'text-brand-navy';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

export function PracticeResults({
  result,
  onPractiseAgain,
  onReviewTopics,
  onGoHistory,
  onRetryMissed,
}: {
  result: PracticeSessionResult;
  onPractiseAgain: () => void;
  onReviewTopics: () => void;
  onGoHistory: () => void;
  onRetryMissed: () => void;
}) {
  const { t } = useI18n();
  const incorrect = result.total - result.correct;
  const missed = result.items.filter((i) => !i.isCorrect);
  const perf = computeTopicPerformance(result.items);
  const strong = perf.filter((p) => p.percent >= 75);
  const needsWork = perf.filter((p) => p.percent < 60);
  const suggestions = buildSuggestions(perf, result.mode, MODE_LABELS[result.mode]);

  return (
    <div>
      {/* Score header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <TrophyIcon width={26} height={26} />
          </span>
          <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-slate-500">{t('practice.yourScore')}</p>
          <p className="mt-1 font-serif text-5xl font-bold text-brand-navy">{result.scorePercent}%</p>
          <p className="mt-2 text-sm text-slate-500">
            {t(`practice.modes.${result.mode}`)} · {t(`practice.difficultyLabels.${result.difficulty}`)} ·{' '}
            {result.sourceNames.slice(0, 2).join(', ')}
            {result.sourceNames.length > 2 ? ` ${t('practice.moreCount').replace('{n}', String(result.sourceNames.length - 2))}` : ''}
          </p>
          <p className="text-xs text-slate-400">{`${t('practice.practisedOn')} ${formatDate(result.createdAt)}`}</p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label={t('practice.answered')} value={String(result.total)} tone="navy" />
          <Stat label={t('practice.correctStat')} value={String(result.correct)} tone="blue" />
          <Stat label={t('practice.incorrectStat')} value={String(incorrect)} tone="red" />
        </div>
      </div>

      {/* Topic breakdown */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-brand-navy">
            <span className="text-blue-600"><CheckIcon width={18} height={18} /></span> {t('practice.understandsWell')}
          </h3>
          {strong.length ? (
            <ul className="mt-3 space-y-2">
              {strong.map((t) => (
                <li key={t.topic} className="flex items-center justify-between rounded-lg bg-blue-50/60 px-3 py-2 text-sm">
                  <span className="font-medium text-brand-navy">{t.topic}</span>
                  <span className="text-blue-700">{t.correct}/{t.total} · {t.percent}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t('practice.noStrongYet')}</p>
          )}

          <h3 className="mt-6 flex items-center gap-2 font-serif text-lg font-bold text-brand-navy">
            <span className="text-red-500"><XIcon width={18} height={18} /></span> {t('practice.needsMoreRevision')}
          </h3>
          {needsWork.length ? (
            <ul className="mt-3 space-y-2">
              {needsWork.map((t) => (
                <li key={t.topic} className="flex items-center justify-between rounded-lg bg-red-50/60 px-3 py-2 text-sm">
                  <span className="font-medium text-brand-navy">{t.topic}</span>
                  <span className="text-red-600">{t.correct}/{t.total} · {t.percent}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t('practice.nothingWeak')}</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="font-serif text-lg font-bold text-brand-navy">{t('practice.howToImprove')}</h3>
          <ul className="mt-3 space-y-3 text-sm text-slate-600">
            {suggestions.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 text-blue-600"><ArrowRightIcon width={15} height={15} /></span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          {missed.length > 0 && (
            <button
              type="button"
              onClick={onRetryMissed}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <RefreshIcon width={16} height={16} /> {t('practice.practiceMissed').replace('{n}', String(missed.length))}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onPractiseAgain}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <RefreshIcon width={16} height={16} /> {t('practice.practiseAgain')}
        </button>
        <button
          type="button"
          onClick={onReviewTopics}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-50"
        >
          <TargetIcon width={16} height={16} /> {t('practice.reviewKeyTopics')}
        </button>
        <button
          type="button"
          onClick={onGoHistory}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-50"
        >
          <HistoryIcon width={16} height={16} /> {t('practice.viewProgress')}
        </button>
      </div>
    </div>
  );
}
