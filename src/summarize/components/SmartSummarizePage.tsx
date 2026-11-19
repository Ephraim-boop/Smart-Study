import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  PrintIcon,
  TargetIcon,
} from '../../components/icons';
import { useNotes } from '../NotesProvider';
import { useSavedSummaries } from '../SavedSummariesProvider';
import { useI18n } from '../../i18n/LanguageProvider';
import { combineExtracted, extractNoteText, isSummarizable } from '../lib/extractText';
import { summarizeNotes } from '../lib/summarizeApi';
import { checkAiService, type AiServiceStatus } from '../../ai/aiRoutes';
import { aiErrorMessage, type AiErrorCode } from '../../ai/aiErrors';
import { SummaryView } from './SummaryView';
import {
  LANGUAGE_LABELS,
  LENGTH_LABELS,
  SummarizeError,
  type SummaryLanguage,
  type SummaryLength,
  type SummaryResult,
} from '../types';
import type { UploadedNote } from '../../upload/types';

/** Render a summary as readable plain text for copy / download / save. */
function summaryToText(
  result: SummaryResult,
  language: SummaryLanguage,
  length: SummaryLength,
): string {
  const lines: string[] = [];
  lines.push(`${LENGTH_LABELS[length]} summary · ${LANGUAGE_LABELS[language]}`);
  lines.push('');
  lines.push('MAIN SUMMARY');
  lines.push(result.mainSummary);
  lines.push('');
  if (result.keyPoints.length) {
    lines.push('KEY POINTS');
    result.keyPoints.forEach((k) => lines.push(`- ${k}`));
    lines.push('');
  }
  if (result.definitions.length) {
    lines.push('DEFINITIONS');
    result.definitions.forEach((d) => lines.push(`- ${d.term}: ${d.definition}`));
    lines.push('');
  }
  if (result.facts.length) {
    lines.push('IMPORTANT FACTS, DATES & FORMULAS');
    result.facts.forEach((f) => lines.push(`- ${f}`));
    lines.push('');
  }
  if (result.topics.length) {
    lines.push('TOPICS');
    result.topics.forEach((t) => lines.push(`- ${t.title}: ${t.explanation}`));
    lines.push('');
  }
  if (result.revisionTips.length) {
    lines.push('REVISION TIPS');
    result.revisionTips.forEach((t) => lines.push(`- ${t}`));
  }
  return lines.join('\n');
}

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1.5 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              value === o.value ? 'bg-brand-navy text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoteRow({
  note,
  checked,
  canSummarize,
  onToggle,
}: {
  note: UploadedNote;
  checked: boolean;
  canSummarize: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border p-3 transition ${
        checked ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white'
      } ${canSummarize ? 'cursor-pointer' : 'opacity-70'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!canSummarize}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
      />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
        {note.previewUrl ? (
          <img src={note.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileTextIcon width={18} height={18} className="text-slate-400" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-brand-navy">{note.name}</span>
        <span className="text-xs text-slate-400">
          {canSummarize ? t('summarize.ready') : t('summarize.needsOcr')}
        </span>
      </span>
      {note.mime.startsWith('image/') && (
        <ImageIcon width={16} height={16} className="shrink-0 text-slate-300" />
      )}
    </label>
  );
}

export function SmartSummarizePage({
  onBack,
  onUploadNotes,
  onOpenSaved,
}: {
  onBack: () => void;
  onUploadNotes: () => void;
  onOpenSaved: () => void;
}) {
  const { notes, selectedIds, setSelectedIds, markSummarized, summarizedIds } = useNotes();
  const { add: saveToLibrary, count: savedCount } = useSavedSummaries();
  const { t } = useI18n();
  const [length, setLength] = useState<SummaryLength>('medium');
  const [language, setLanguage] = useState<SummaryLanguage>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiServiceStatus | null>(null);


  // Default-select every summarizable note once the list is known. Notes are now
  // read back from the student's vault after this page mounts, so waiting for the
  // first render (as before) left nothing selected after a refresh.
  const summarizableIds = useMemo(
    () => notes.filter(isSummarizable).map((n) => n.id),
    [notes],
  );
  const autoSelected = useMemo(() => notes.some((n) => selectedIds.includes(n.id)), [notes, selectedIds]);
  useEffect(() => {
    if (!autoSelected && summarizableIds.length) setSelectedIds(summarizableIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summarizableIds, autoSelected]);

  // Pre-flight: ask the AI service whether it is actually up before the student
  // waits through extraction for a request that cannot succeed.
  useEffect(() => {
    let active = true;
    void checkAiService().then((status) => active && setAiStatus(status));
    return () => {
      active = false;
    };
  }, []);

  const chosen = useMemo(
    () => notes.filter((n) => selectedIds.includes(n.id)),
    [notes, selectedIds],
  );

  function toggleNote(id: string) {
    setSelectedIds(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  // Every code has its own translated sentence, so the cause is never flattened
  // into "we couldn't generate your summary" again.
  function errorTextForCode(code: AiErrorCode, fallback?: string): string {
    const key = `summarize.errors.${code}`;
    const translated = t(key);
    return translated === key ? fallback?.trim() || aiErrorMessage(code, 'summarize') : translated;
  }

  const aiWarning = useMemo(() => {
    if (!aiStatus) return null;
    if (!aiStatus.reachable) return errorTextForCode(aiStatus.code ?? 'server_unreachable', aiStatus.message);
    if (aiStatus.checked && aiStatus.keyConfigured === false) {
      return errorTextForCode('ai_not_configured', aiStatus.message);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiStatus]);

  // Map a thrown summarize error to a translated, user-safe message by code.
  function summarizeErrorText(e: unknown): string {
    if (e instanceof SummarizeError) return errorTextForCode(e.code, e.message);
    return t('summarize.somethingWrong');
  }

  async function handleGenerate() {
    setError(null);
    setResult(null);
    setProblems([]);
    setCopied(false);
    setSavedMsg(false);

    if (chosen.length === 0) {
      setError(t('summarize.selectOne'));
      return;
    }

    setBusy(true);
    const extracted: { name: string; text: string; truncated: boolean }[] = [];
    const failures: string[] = [];
    for (const note of chosen) {
      try {
        const res = await extractNoteText(note);
        if (res.ok) {
          extracted.push({ name: note.name, text: res.text, truncated: res.truncated });
        } else {
          failures.push(res.reason);
        }
      } catch (e) {
        failures.push(`"${note.name}" could not be opened: ${String((e as Error)?.message ?? e).slice(0, 140)}`);
      }
    }

    // Combined text is capped to what the backend accepts, and the student is
    // told when it had to be trimmed.
    const combined = combineExtracted(extracted);
    setProblems([...failures, ...combined.notes]);

    if (!combined.text.trim()) {
      setBusy(false);
      setError(t('summarize.noReadable'));
      return;
    }

    try {
      const sourceNames = chosen.map((n) => n.name);
      const summary = await summarizeNotes({
        text: combined.text,
        length,
        language,
        sourceName: sourceNames.join(', '),
      });
      setResult(summary);
      markSummarized(chosen.map((n) => n.id));
      // Keep the summary in the "My summarise" review library (unchanged feature).
      saveToLibrary({ result: summary, length, language, sourceNames });
      setSavedMsg(true);
      window.setTimeout(() => setSavedMsg(false), 3000);
    } catch (e) {
      setError(summarizeErrorText(e));
      // A failure usually means the service moved — re-check so the banner shows
      // the real cause instead of a stale "all good".
      void checkAiService().then(setAiStatus);
    } finally {
      setBusy(false);
    }
  }


  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(summaryToText(result, language, length));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('summarize.copyBlocked'));
    }
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([summaryToText(result, language, length)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studysmart-summary.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    if (!result) return;
    window.print();
  }

  function handleReviewTopics() {
    if (!result) return;
    document.getElementById('summary-topics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const hasNotes = notes.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 font-sans text-slate-700">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="rounded-[2rem] border border-white/20 bg-slate-50/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <ArrowLeftIcon width={15} height={15} /> {t('summarize.back')}
          </button>
          <div>
            <h1 className="font-serif text-2xl font-bold text-brand-navy">{t('summarize.title')}</h1>
            <p className="text-sm text-slate-500">
              {t('summarize.subtitle')}
            </p>
          </div>
        </div>

        {!hasNotes ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-slate-500">{t('summarize.empty')}</p>
            <button
              type="button"
              onClick={onUploadNotes}
              className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t('summarize.uploadNotes')}
            </button>
          </div>
        ) : (
          <>
            {/* File selection */}
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {t('summarize.chooseHeading')}
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {notes.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    checked={selectedIds.includes(n.id)}
                    canSummarize={isSummarizable(n)}
                    onToggle={() => toggleNote(n.id)}
                  />
                ))}
              </div>
              {summarizedIds.size > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  {t('summarize.againNote')}
                </p>
              )}
            </section>

            {/* Options + generate */}
            <section className="mt-6 flex flex-wrap items-end gap-6 rounded-2xl border border-slate-200 bg-white p-5">
              <OptionGroup
                label={t('summarize.length')}
                value={length}
                onChange={setLength}
                options={(Object.keys(LENGTH_LABELS) as SummaryLength[]).map((v) => ({
                  value: v,
                  text: t(`summarize.lengths.${v}`),
                }))}
              />
              <OptionGroup
                label={t('summarize.language')}
                value={language}
                onChange={setLanguage}
                options={(Object.keys(LANGUAGE_LABELS) as SummaryLanguage[]).map((v) => ({
                  value: v,
                  text: t(`summarize.languages.${v}`),
                }))}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy || chosen.length === 0}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? t('summarize.summarizing') : t('summarize.generate')}
              </button>
            </section>

            {/* AI service pre-flight: names the cause instead of a mystery failure.
                Skipped when the error box below already says exactly this. */}
            {!busy && aiWarning && aiWarning !== error && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                <AlertIcon width={18} height={18} className="mt-0.5 shrink-0 text-amber-600" />
                <span>{aiWarning}</span>
              </div>
            )}

            {/* Loading */}
            {busy && (
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-800">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <span className="text-sm font-medium">
                  {t('summarize.analyzing')}
                </span>
              </div>
            )}

            {/* Problems reading some files (non-fatal) */}
            {!busy && problems.length > 0 && (
              <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                <p className="font-semibold">{t('summarize.problemsHeading')}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error */}
            {!busy && error && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                <AlertIcon width={18} height={18} className="mt-0.5 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Result */}
            {result && !busy && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
                  <h2 className="mr-auto font-serif text-lg font-bold text-brand-navy">
                    {t('summarize.yourSummary')}
                  </h2>
                  <Action onClick={handleCopy} icon={copied ? <CheckIcon width={15} height={15} /> : undefined}>
                    {copied ? t('summarize.copied') : t('summarize.copySummary')}
                  </Action>
                  <Action onClick={handleDownload} icon={<DownloadIcon width={15} height={15} />}>
                    {t('summarize.download')}
                  </Action>
                  <Action onClick={handlePrint} icon={<PrintIcon width={15} height={15} />}>
                    {t('summarize.print')}
                  </Action>
                  <Action
                    onClick={handleReviewTopics}
                    icon={<TargetIcon width={15} height={15} />}
                    primary
                  >
                    {t('summarize.reviewKeyTopics')}
                  </Action>
                  <Action onClick={onOpenSaved} icon={<FileTextIcon width={15} height={15} />}>
                    {savedCount > 0 ? `${t('summarize.viewSaved')} (${savedCount})` : t('summarize.viewSaved')}
                  </Action>
                </div>

                {savedMsg && (
                  <p className="mt-3 text-xs text-blue-700">
                    {t('summarize.savedToast')}
                  </p>
                )}

                <div className="mt-5">
                  <SummaryView result={result} />
                </div>
              </section>
            )}

          </>
        )}
        </div>
      </main>
    </div>
  );
}

function Action({
  onClick,
  icon,
  children,
  primary,
}: {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        primary
          ? 'bg-brand-navy text-white hover:opacity-90'
          : 'border border-slate-200 text-brand-navy hover:bg-slate-50'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
