import { useState } from 'react';
import { ArrowLeftIcon } from '../../components/icons';
import { usePractice } from '../PracticeProvider';
import { useI18n } from '../../i18n/LanguageProvider';
import { makeSessionId } from '../lib/practiceStorage';
import { missedToQuestions } from '../lib/practiceAnalysis';
import { PracticeSetup } from './PracticeSetup';
import { PracticeSession } from './PracticeSession';
import { PracticeResults } from './PracticeResults';
import { PracticeHistory } from './PracticeHistory';
import type {
  AnswerRecord,
  PracticeQuestion,
  PracticeSessionResult,
  SessionMeta,
} from '../types';

type Phase = 'setup' | 'session' | 'results' | 'history';

export function PracticePage({
  onBack,
  onUploadNotes,
  onReviewTopics,
}: {
  onBack: () => void;
  onUploadNotes: () => void;
  onReviewTopics: () => void;
}) {
  const { add, count: historyCount } = usePractice();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('setup');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [result, setResult] = useState<PracticeSessionResult | null>(null);

  function startSession(qs: PracticeQuestion[], m: SessionMeta) {
    setQuestions(qs);
    setMeta(m);
    setResult(null);
    setPhase('session');
  }

  function completeSession(items: AnswerRecord[], m: SessionMeta) {
    const total = items.length;
    const correct = items.filter((i) => i.isCorrect).length;
    const session: PracticeSessionResult = {
      id: makeSessionId(),
      createdAt: Date.now(),
      mode: m.mode,
      difficulty: m.difficulty,
      sourceNames: m.sourceNames,
      topic: m.topic,
      total,
      correct,
      scorePercent: total ? Math.round((correct / total) * 100) : 0,
      items,
    };
    add(session);
    setResult(session);
    setPhase('results');
  }

  function retryMissedFromResult(r: PracticeSessionResult) {
    const qs = missedToQuestions(r.items);
    if (qs.length === 0) return;
    startSession(qs, { mode: r.mode, difficulty: r.difficulty, sourceNames: r.sourceNames, topic: r.topic });
  }

  // Header back: leave practice entirely from setup, otherwise step back a phase.
  function handleBack() {
    if (phase === 'setup') onBack();
    else if (phase === 'session') setPhase('setup');
    else setPhase('setup');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 font-sans text-slate-700">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:text-base"
          >
            <ArrowLeftIcon width={18} height={18} className="text-white" />
            <span>{t('practice.back')}</span>
          </button>
          <h1 className="min-w-0 flex-1 break-words text-base font-bold text-slate-900 sm:text-lg">{t('practice.title')}</h1>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
        <div className="min-w-0 rounded-[2rem] border border-white/20 bg-slate-50/95 p-4 shadow-2xl backdrop-blur-sm sm:p-8">
        {phase === 'setup' && (
          <PracticeSetup
            onStart={startSession}
            onUploadNotes={onUploadNotes}
            onGoHistory={() => setPhase('history')}
            historyCount={historyCount}
          />
        )}

        {phase === 'session' && meta && (
          <PracticeSession
            questions={questions}
            meta={meta}
            onExit={() => setPhase('setup')}
            onComplete={completeSession}
          />
        )}

        {phase === 'results' && result && (
          <PracticeResults
            result={result}
            onPractiseAgain={() => setPhase('setup')}
            onReviewTopics={onReviewTopics}
            onGoHistory={() => setPhase('history')}
            onRetryMissed={() => retryMissedFromResult(result)}
          />
        )}

        {phase === 'history' && (
          <PracticeHistory
            onBack={() => setPhase('setup')}
            onRetry={(qs, session) =>
              startSession(qs, {
                mode: session.mode,
                difficulty: session.difficulty,
                sourceNames: session.sourceNames,
                topic: session.topic,
              })
            }
          />
        )}
        </div>
      </main>
    </div>
  );
}
