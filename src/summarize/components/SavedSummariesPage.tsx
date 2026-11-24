import { useState } from 'react';
import {
  ArrowLeftIcon,
  FileTextIcon,
  TrashIcon,
} from '../../components/icons';
import { useSavedSummaries } from '../SavedSummariesProvider';
import { useI18n } from '../../i18n/LanguageProvider';
import type { SavedSummary } from '../lib/savedSummaries';
import { SummaryView } from './SummaryView';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** One-line preview of a saved summary's main text. */
function preview(s: SavedSummary): string {
  const text = s.result.mainSummary.replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export function SavedSummariesPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { saved, count, remove, clear, storageBlocked } = useSavedSummaries();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 font-sans text-slate-700">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <ArrowLeftIcon width={18} height={18} /> {t('saved.back')}
          </button>
          <h1 className="min-w-0 flex-1 break-words font-serif text-base font-bold text-slate-900 sm:text-lg">
            {t('saved.title')}
          </h1>
          {count > 0 && (
            <button
              type="button"
              onClick={() => (confirmClear ? (clear(), setConfirmClear(false)) : setConfirmClear(true))}
              onBlur={() => setConfirmClear(false)}
              className="ml-auto shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 sm:text-sm"
            >
              {confirmClear ? t('saved.confirmDelete') : t('saved.deleteAll')}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
        <div className="min-w-0 rounded-[2rem] border border-white/20 bg-slate-50/95 p-4 shadow-2xl backdrop-blur-sm sm:p-8">
        {storageBlocked && (
          <div className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
            {t('saved.storageBlocked')}
          </div>
        )}

        {count === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FileTextIcon width={22} height={22} />
            </span>
            <p className="mt-4 font-serif text-lg font-bold text-brand-navy">
              {t('saved.emptyTitle')}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {t('saved.emptyBody')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {saved.map((s) => {
              const open = openId === s.id;
              return (
                <section
                  key={s.id}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                >
                  <div className="flex min-w-0 flex-wrap items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <h2 className="truncate font-serif text-base font-bold text-brand-navy">
                        {s.title}
                      </h2>
                      <p className="mt-0.5 break-words text-xs text-slate-400">
                        {formatDate(s.savedAt)} · {t(`summarize.lengths.${s.length}`)} ·{' '}
                        {t(`summarize.languages.${s.language}`)}
                      </p>
                      {!open && (
                        <p className="mt-2 text-sm text-slate-600">{preview(s)}</p>
                      )}
                    </button>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : s.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-slate-50"
                      >
                        {open ? t('saved.hide') : t('saved.review')}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t('saved.deleteAria')} ${s.title}`}
                        onClick={() => {
                          remove(s.id);
                          if (open) setOpenId(null);
                        }}
                        className="rounded-lg border border-slate-200 p-2 text-red-600 transition hover:border-red-200 hover:bg-red-50"
                      >
                        <TrashIcon width={16} height={16} />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-5 border-t border-slate-100 pt-5">
                      <SummaryView result={s.result} />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
