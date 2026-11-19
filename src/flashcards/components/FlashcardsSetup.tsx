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
import { generateFlashcards } from '../lib/flashcardsApi';
import type { UploadedNote } from '../../upload/types';
import {
  DECK_COUNTS,
  DIFFICULTY_LABELS,
  FlashcardsError,
  type Flashcard,
  type FlashcardDifficulty,
} from '../types';

/** A segmented control matching the Smart Summarize / Practice option style. */
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
          {usable ? t('flashcards.ready') : t('flashcards.needsOcr')}
        </span>
      </span>
      {note.mime.startsWith('image/') && <ImageIcon width={16} height={16} className="shrink-0 text-slate-300" />}
    </label>
  );
}

export interface FlashcardsSetupResult {
  cards: Flashcard[];
  sourceNames: string[];
  topic?: string;
  difficulty: FlashcardDifficulty;
}

export function FlashcardsSetup({
  onGenerated,
  onUploadNotes,
  onGoLibrary,
  deckCount,
}: {
  onGenerated: (result: FlashcardsSetupResult) => void;
  onUploadNotes: () => void;
  onGoLibrary: () => void;
  deckCount: number;
}) {
  const { notes, selectedIds, setSelectedIds } = useNotes();
  const { t } = useI18n();
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>('medium');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  function flashcardsErrorText(e: unknown): string {
    if (e instanceof FlashcardsError) {
      const key = `flashcards.errors.${e.code}`;
      const tr = t(key);
      return tr === key ? e.message : tr;
    }
    return t('flashcards.somethingWrong');
  }

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

  async function handleGenerate() {
    setError(null);
    setProblems([]);
    if (chosen.length === 0) {
      setError(t('flashcards.selectOne'));
      return;
    }
    setBusy(true);
    const parts: string[] = [];
    const failures: string[] = [];
    for (const note of chosen) {
      const res = await extractNoteText(note);
      if (res.ok) {
        parts.push(`--- Source: ${note.name} ---\n${res.text}`);
        if (res.truncated) failures.push(t('flashcards.trimmed').replace('{name}', note.name));
      } else {
        failures.push(res.reason);
      }
    }
    setProblems(failures);
    if (parts.length === 0) {
      setBusy(false);
      setError(t('flashcards.noReadable'));
      return;
    }
    try {
      const sourceNames = chosen.map((n) => n.name);
      const cards = await generateFlashcards({
        text: parts.join('\n\n'),
        count,
        difficulty,
        topic: topic.trim() || undefined,
        sourceName: sourceNames.join(', '),
      });
      onGenerated({ cards, sourceNames, topic: topic.trim() || undefined, difficulty });
    } catch (e) {
      setError(flashcardsErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const hasNotes = notes.length > 0;

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="font-serif text-2xl font-bold text-brand-navy">{t('flashcards.title')}</h2>
        <p className="mt-1 text-slate-500">{t('flashcards.subtitle')}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGoLibrary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-brand-navy transition hover:bg-slate-50"
          >
            <HistoryIcon width={15} height={15} />
            {deckCount > 0 ? t('flashcards.myDecksCount').replace('{n}', String(deckCount)) : t('flashcards.myDecks')}
          </button>
        </div>
      </div>

      {!hasNotes ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="mt-3 text-slate-500">{t('flashcards.empty')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('flashcards.emptyHint')}</p>
          <button
            type="button"
            onClick={onUploadNotes}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('flashcards.uploadNotes')}
          </button>
        </div>
      ) : (
        <>
          <section className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('flashcards.chooseHeading')}
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
            <div className="flex flex-wrap items-end gap-6">
              <Segmented
                label={t('flashcards.countLabel')}
                value={count}
                onChange={setCount}
                options={DECK_COUNTS.map((c) => ({ value: c, text: String(c) }))}
              />
              <Segmented
                label={t('flashcards.difficulty')}
                value={difficulty}
                onChange={setDifficulty}
                options={(Object.keys(DIFFICULTY_LABELS) as FlashcardDifficulty[]).map((v) => ({
                  value: v,
                  text: t(`flashcards.difficultyLabels.${v}`),
                }))}
              />
            </div>

            <div className="mt-6">
              <label htmlFor="fc-topic" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('flashcards.topicLabel')}
              </label>
              <input
                id="fc-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('flashcards.topicPlaceholder')}
                className="mt-1.5 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || chosen.length === 0}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('flashcards.creating') : t('flashcards.generate')}
            </button>
          </section>

          {busy && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-800">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <span className="text-sm font-medium">{t('flashcards.analyzing')}</span>
            </div>
          )}

          {!busy && problems.length > 0 && (
            <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
              <p className="font-semibold">{t('flashcards.problemsHeading')}</p>
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
