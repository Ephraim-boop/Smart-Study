import { useState } from 'react';
import {
  ArrowLeftIcon,
  CheckIcon,
  PlayIcon,
  TrashIcon,
  XIcon,
} from '../../components/icons';
import { useFlashcards } from '../FlashcardsProvider';
import { useI18n } from '../../i18n/LanguageProvider';
import type { FlashcardDeck } from '../types';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function progressSummary(deck: FlashcardDeck): { reviewed: number; remembered: number } {
  let reviewed = 0;
  let remembered = 0;
  for (const c of deck.cards) {
    const s = deck.progress[c.id];
    if (s) reviewed += 1;
    if (s === 'got_it') remembered += 1;
  }
  return { reviewed, remembered };
}

function DeckCard({
  deck,
  onOpen,
  onRename,
  onDelete,
}: {
  deck: FlashcardDeck;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deck.title);
  const [confirming, setConfirming] = useState(false);
  const { reviewed, remembered } = progressSummary(deck);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(draft);
                    setEditing(false);
                  }
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-brand-navy outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
              <button
                type="button"
                onClick={() => {
                  onRename(draft);
                  setEditing(false);
                }}
                className="rounded-lg bg-brand-navy p-1.5 text-white hover:bg-slate-800"
                aria-label={t('flashcards.saveName')}
              >
                <CheckIcon width={15} height={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(deck.title);
                  setEditing(false);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label={t('flashcards.cancelRename')}
              >
                <XIcon width={15} height={15} />
              </button>
            </div>
          ) : (
            <h3 className="truncate font-serif text-lg font-bold text-brand-navy">{deck.title}</h3>
          )}
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {deck.sourceNames.join(', ')} · {t('flashcards.created').replace('{date}', formatDate(deck.createdAt))}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <span>{t('flashcards.nCards').replace('{n}', String(deck.cards.length))}</span>
        <span>{t('flashcards.nReviewed').replace('{n}', String(reviewed))}</span>
        <span className="text-emerald-600">{t('flashcards.nRemembered').replace('{n}', String(remembered))}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-teal-600"
        >
          <PlayIcon width={15} height={15} /> {t('flashcards.study')}
        </button>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(deck.title);
              setEditing(true);
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy transition hover:bg-slate-50"
          >
            {t('flashcards.rename')}
          </button>
        )}
        {confirming ? (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
            >
              {t('flashcards.confirmDelete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <TrashIcon width={15} height={15} /> {t('flashcards.delete')}
          </button>
        )}
      </div>
    </div>
  );
}

export function SavedDecks({
  onBack,
  onOpenDeck,
}: {
  onBack: () => void;
  onOpenDeck: (deck: FlashcardDeck) => void;
}) {
  const { decks, storageBlocked, renameDeck, removeDeck } = useFlashcards();
  const { t } = useI18n();

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <ArrowLeftIcon width={15} height={15} /> {t('common.back')}
        </button>
        <div>
          <h2 className="font-serif text-2xl font-bold text-brand-navy">{t('flashcards.libraryTitle')}</h2>
          <p className="text-sm text-slate-500">{t('flashcards.librarySubtitle')}</p>
        </div>
      </div>

      {storageBlocked && (
        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          {t('flashcards.storageBlocked')}
        </div>
      )}

      {decks.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-500">{t('flashcards.noDecks')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('flashcards.noDecksHint')}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onOpen={() => onOpenDeck(deck)}
              onRename={(title) => renameDeck(deck.id, title)}
              onDelete={() => removeDeck(deck.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
