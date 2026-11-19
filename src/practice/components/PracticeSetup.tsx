import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertIcon,
  FileTextIcon,
  HistoryIcon,
  ImageIcon,
} from '../../components/icons';
import { useNotes } from '../../summarize/NotesProvider';
import { extractNoteText } from '../../summarize/lib/extractText';
import { useI18n } from '../../i18n/LanguageProvider';
import { generateQuestions } from '../lib/practiceApi';
import type { UploadedNote } from '../../upload/types';
import {
  DIFFICULTY_LABELS,
  MODE_LABELS,
  PracticeError,
  QUESTION_COUNTS,
  type Difficulty,
  type PracticeMode,
  type PracticeQuestion,
  type SessionMeta,
} from '../types';

/** A segmented control matching the Smart Summarize option style. */
function Segmented<T extends string | number>({
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
      <div className="mt-1.5 inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
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
  usable,
  onToggle,
}: {
  note: UploadedNote;
  checked: boolean;
  usable: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border p-3 transition ${
        checked ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white'
      } ${usable ? 'cursor-pointer' : 'opacity-70'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!usable}
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
          {usable ? t('practice.ready') : t('practice.needsOcr')}
        </span>
      </span>
      {note.mime.startsWith('image/') && <ImageIcon width={16} height={16} className="shrink-0 text-slate-300" />}
    </label>
  );
}

export function PracticeSetup({
  onStart,
  onUploadNotes,
  onGoHistory,
  historyCount,
}: {
  onStart: (questions: PracticeQuestion[], meta: SessionMeta) => void;
  onUploadNotes: () => void;
  onGoHistory: () => void;
  historyCount: number;
}) {
  const { notes, selectedIds, setSelectedIds } = useNotes();
  const { t } = useI18n();
  const [mode, setMode] = useState<PracticeMode>('mc');
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const isUsable = useCallback(
    (n: UploadedNote) => n.mime === 'application/pdf' || /\.(pdf|txt|md)$/i.test(n.name),
    [],
  );

  // Default-select every usable note the first time the setup opens.
  useEffect(() => {
    if (selectedIds.length === 0) {
      const auto = notes.filter(isUsable).map((n) => n.id);
      if (auto.length) setSelectedIds(auto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = useMemo(() => notes.filter((n) => selectedIds.includes(n.id)), [notes, selectedIds]);

  function toggleNote(id: string) {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  // Map a thrown practice error to a translated, user-safe message by code.
  function practiceErrorText(e: unknown): string {
    if (e instanceof PracticeError) {
      const key = `practice.errors.${e.code}`;
      const translated = t(key);
      return translated === key ? e.message : translated;
    }
    return t('practice.somethingWrong');
  }

  async function handleGenerate() {
    setError(null);
    setProblems([]);
    if (chosen.length === 0) {
      setError(t('practice.selectOne'));
      return;
    }
    setBusy(true);
    const parts: string[] = [];
    const failures: string[] = [];
    for (const note of chosen) {
      const res = await extractNoteText(note);
      if (res.ok) {
        parts.push(`--- Source: ${note.name} ---\n${res.text}`);
        if (res.truncated) failures.push(`"${note.name}" was very long and got trimmed.`);
      } else {
        failures.push(res.reason);
      }
    }
    setProblems(failures);
    if (parts.length === 0) {
      setBusy(false);
      setError(t('practice.noReadable'));
      return;
    }
    try {
      const sourceNames = chosen.map((n) => n.name);
      const questions = await generateQuestions({
        text: parts.join('\n\n'),
        mode,
        count,
        difficulty,
        topic: topic.trim() || undefined,
        sourceName: sourceNames.join(', '),
      });
      onStart(questions, { mode, difficulty, sourceNames, topic: topic.trim() || undefined });
    } catch (e) {
      setError(practiceErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const hasNotes = notes.length > 0;

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="font-serif text-2xl font-bold text-brand-navy">{t('practice.title')}</h2>
        <p className="mt-1 text-slate-500">{t('practice.subtitle')}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGoHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-brand-navy transition hover:bg-slate-50"
          >
            <HistoryIcon width={15} height={15} />
            {historyCount > 0 ? `${t('practice.viewProgress')} (${historyCount})` : t('practice.viewProgress')}
          </button>
        </div>
      </div>

      {!hasNotes ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-500">{t('practice.empty')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('practice.emptyHint')}</p>
          <button
            type="button"
            onClick={onUploadNotes}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('practice.uploadNotes')}
          </button>
        </div>
      ) : (
        <>
          <section className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('practice.chooseHeading')}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {notes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  checked={selectedIds.includes(n.id)}
                  usable={isUsable(n)}
                  onToggle={() => toggleNote(n.id)}
                />
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t('practice.modeHeading')}</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(MODE_LABELS) as PracticeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-xl border p-3 text-left transition ${
                    mode === m ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-brand-navy">{t(`practice.modes.${m}`)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{t(`practice.modeDesc.${m}`)}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-6">
              <Segmented
                label={t('practice.questions')}
                value={count}
                onChange={setCount}
                options={QUESTION_COUNTS.map((c) => ({ value: c, text: String(c) }))}
              />
              <Segmented
                label={t('practice.difficulty')}
                value={difficulty}
                onChange={setDifficulty}
                options={(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((v) => ({
                  value: v,
                  text: t(`practice.difficultyLabels.${v}`),
                }))}
              />
            </div>

            <div className="mt-6">
              <label htmlFor="practice-topic" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('practice.topicLabel')}
              </label>
              <input
                id="practice-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('practice.topicPlaceholder')}
                className="mt-1.5 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || chosen.length === 0}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('practice.generating') : t('practice.generate')}
            </button>
          </section>

          {busy && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-800">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <span className="text-sm font-medium">{t('practice.analyzing')}</span>
            </div>
          )}

          {!busy && problems.length > 0 && (
            <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
              <p className="font-semibold">{t('practice.problemsHeading')}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {!busy && error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              <AlertIcon width={18} height={18} className="mt-0.5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
