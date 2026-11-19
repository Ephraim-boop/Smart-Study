import { useState } from 'react';
import { ArrowLeftIcon } from '../../components/icons';
import { useI18n } from '../../i18n/LanguageProvider';
import { useFlashcards } from '../FlashcardsProvider';
import { makeDeckId } from '../lib/flashcardsStorage';
import type { Flashcard, FlashcardDeck, ReviewStatus } from '../types';
import { FlashcardsSetup, type FlashcardsSetupResult } from './FlashcardsSetup';
import { FlashcardDeck as FlashcardStudy } from './FlashcardDeck';
import { DeckSummary } from './DeckSummary';
import { SavedDecks } from './SavedDecks';

type Phase = 'setup' | 'study' | 'summary' | 'library';

export function FlashcardsPage({
  onBack,
  onUploadNotes,
}: {
  onBack: () => void;
  onUploadNotes: () => void;
}) {
  const { count: deckCount, saveDeck, recordProgress } = useFlashcards();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('setup');
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [studyCards, setStudyCards] = useState<Flashcard[]>([]);
  const [lastProgress, setLastProgress] = useState<Record<string, ReviewStatus>>({});

  function handleGenerated(result: FlashcardsSetupResult) {
    const now = Date.now();
    let title: string;
    if (result.topic) {
      title = t('flashcards.deckTitleTopic').replace('{topic}', result.topic.trim());
    } else {
      const first = result.sourceNames[0] ?? '';
      const base = first.replace(/\.[^.]+$/, '').trim();
      title = base ? t('flashcards.deckTitleFromSource').replace('{base}', base) : t('flashcards.title');
    }
    const newDeck: FlashcardDeck = {
      id: makeDeckId(),
      title,
      sourceNames: result.sourceNames,
      cards: result.cards,
      createdAt: now,
      updatedAt: now,
      progress: {},
    };
    saveDeck(newDeck);
    setDeck(newDeck);
    setStudyCards(result.cards);
    setLastProgress({});
    setPhase('study');
  }

  function handleFinish(progress: Record<string, ReviewStatus>) {
    if (deck) {
      recordProgress(deck.id, progress);
      setDeck({ ...deck, progress: { ...deck.progress, ...progress }, updatedAt: Date.now() });
    }
    setLastProgress(progress);
    setPhase('summary');
  }

  function openDeck(target: FlashcardDeck) {
    setDeck(target);
    setStudyCards(target.cards);
    setLastProgress(target.progress);
    setPhase('study');
  }

  function practiseDifficult(difficult: Flashcard[]) {
    if (difficult.length === 0) return;
    setStudyCards(difficult);
    setPhase('study');
  }

  function studyWholeDeck() {
    if (!deck) return;
    setStudyCards(deck.cards);
    setPhase('study');
  }

  // Header back: leave flashcards entirely from setup, otherwise step back to setup.
  function handleBack() {
    if (phase === 'setup') onBack();
    else setPhase('setup');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 font-sans text-slate-700">
      {phase !== 'library' && (
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              <ArrowLeftIcon width={18} height={18} /> {t('flashcards.back')}
            </button>
            <h1 className="font-serif text-lg font-bold text-slate-900">{t('flashcards.title')}</h1>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="rounded-[2rem] border border-white/20 bg-slate-50/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        {phase === 'setup' && (
          <FlashcardsSetup
            onGenerated={handleGenerated}
            onUploadNotes={onUploadNotes}
            onGoLibrary={() => setPhase('library')}
            deckCount={deckCount}
          />
        )}

        {phase === 'study' && deck && (
          <FlashcardStudy
            cards={studyCards}
            savedProgress={deck.progress}
            title={deck.title}
            onFinish={handleFinish}
          />
        )}

        {phase === 'summary' && deck && (
          <DeckSummary
            cards={studyCards}
            progress={lastProgress}
            onPractiseDifficult={practiseDifficult}
            onStudyAgain={studyWholeDeck}
            onViewDecks={() => setPhase('library')}
          />
        )}

        {phase === 'library' && (
          <SavedDecks onBack={() => setPhase('setup')} onOpenDeck={openDeck} />
        )}
        </div>
      </main>
    </div>
  );
}
