import { useMemo, useState } from 'react';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  XIcon,
} from '../../components/icons';
import { gradeShortAnswer } from '../lib/practiceApi';
import { useI18n } from '../../i18n/LanguageProvider';
import {
  PracticeError,
  type AnswerRecord,
  type PracticeQuestion,
  type SessionMeta,
  type StudentAnswer,
} from '../types';

interface AnswerState {
  student: StudentAnswer;
  graded: boolean;
  isCorrect: boolean;
  feedback?: string;
  grading?: boolean;
}

const empty: AnswerState = { student: {}, graded: false, isCorrect: false };

export function PracticeSession({
  questions,
  meta,
  onExit,
  onComplete,
}: {
  questions: PracticeQuestion[];
  meta: SessionMeta;
  onExit: () => void;
  onComplete: (items: AnswerRecord[], meta: SessionMeta) => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [error, setError] = useState<string | null>(null);

  const q = questions[index];
  const state = answers[q.id] ?? empty;
  const total = questions.length;
  const isLast = index === total - 1;

  function patch(next: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] ?? empty), ...next } }));
  }
  function setStudent(next: StudentAnswer) {
    patch({ student: { ...state.student, ...next } });
  }

  async function handleSubmit() {
    setError(null);
    if (state.graded || state.grading) return;

    if (q.type === 'mc') {
      if (state.student.selectedIndex === undefined) return;
      patch({ graded: true, isCorrect: state.student.selectedIndex === q.correctIndex });
      return;
    }
    if (q.type === 'tf') {
      if (state.student.booleanAnswer === undefined) return;
      patch({ graded: true, isCorrect: state.student.booleanAnswer === q.correct });
      return;
    }
    // short answer -> grade on the secure backend (never fake it)
    const text = (state.student.textAnswer ?? '').trim();
    if (!text) return;
    patch({ grading: true });
    try {
      const g = await gradeShortAnswer({
        question: q.question,
        referenceAnswer: q.answer ?? '',
        studentAnswer: text,
      });
      patch({ grading: false, graded: true, isCorrect: g.correct, feedback: g.feedback });
    } catch (e) {
      patch({ grading: false });
      if (e instanceof PracticeError) {
        const key = `practice.errors.${e.code}`;
        const translated = t(key);
        setError(translated === key ? e.message : translated);
      } else {
        setError(t('practice.couldNotCheck'));
      }
    }
  }

  function finish() {
    const items: AnswerRecord[] = questions.map((question) => {
      const a = answers[question.id] ?? empty;
      return {
        questionId: question.id,
        type: question.type,
        question: question.question,
        topic: question.topic,
        student: a.student,
        isCorrect: a.graded ? a.isCorrect : false,
        explanation: question.explanation,
        options: question.options,
        correctIndex: question.correctIndex,
        correct: question.correct,
        referenceAnswer: question.answer,
      };
    });
    onComplete(items, meta);
  }

  function handleExit() {
    const answered = Object.values(answers).filter((a) => a.graded).length;
    if (answered === 0 || window.confirm(t('practice.leaveConfirm'))) {
      onExit();
    }
  }

  const canSubmit = useMemo(() => {
    if (state.graded || state.grading) return false;
    if (q.type === 'mc') return state.student.selectedIndex !== undefined;
    if (q.type === 'tf') return state.student.booleanAnswer !== undefined;
    return (state.student.textAnswer ?? '').trim().length > 0;
  }, [q, state]);

  const typeLabel = q.type === 'mc' ? t('practice.typeMc') : q.type === 'tf' ? t('practice.typeTf') : t('practice.typeSa');

  return (
    <div>
      {/* Progress header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-brand-navy">
            {t('practice.questionProgress').replace('{n}', String(index + 1)).replace('{total}', String(total))}
          </span>
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          >
            <XIcon width={16} height={16} /> {t('practice.exit')}
          </button>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${((index + (state.graded ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {typeLabel}
          {q.topic ? ` · ${q.topic}` : ''}
        </span>
        <p className="mt-4 text-lg font-semibold leading-relaxed text-brand-navy">{q.question}</p>

        {/* Answer controls */}
        <div className="mt-6">
          {q.type === 'mc' && (
            <div className="space-y-2">
              {(q.options ?? []).map((opt, i) => {
                const selected = state.student.selectedIndex === i;
                const revealCorrect = state.graded && i === q.correctIndex;
                const revealWrong = state.graded && selected && i !== q.correctIndex;
                return (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${
                      revealCorrect
                        ? 'border-blue-400 bg-blue-50'
                        : revealWrong
                          ? 'border-red-300 bg-red-50'
                          : selected
                            ? 'border-blue-400 bg-blue-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={selected}
                      disabled={state.graded}
                      onChange={() => setStudent({ selectedIndex: i })}
                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-brand-navy">{opt}</span>
                  </label>
                );
              })}
            </div>
          )}

          {q.type === 'tf' && (
            <div className="flex gap-3">
              {[true, false].map((val) => {
                const selected = state.student.booleanAnswer === val;
                const revealCorrect = state.graded && q.correct === val;
                const revealWrong = state.graded && selected && q.correct !== val;
                return (
                  <button
                    key={String(val)}
                    type="button"
                    disabled={state.graded}
                    onClick={() => setStudent({ booleanAnswer: val })}
                    className={`flex-1 rounded-xl border p-4 text-sm font-semibold transition ${
                      revealCorrect
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : revealWrong
                          ? 'border-red-300 bg-red-50 text-red-700'
                          : selected
                            ? 'border-blue-400 bg-blue-50/50 text-brand-navy'
                            : 'border-slate-200 text-brand-navy hover:bg-slate-50'
                    } disabled:cursor-not-allowed`}
                  >
                    {val ? t('practice.trueLabel') : t('practice.falseLabel')}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'sa' && (
            <div>
              <textarea
                value={state.student.textAnswer ?? ''}
                disabled={state.graded}
                onChange={(e) => setStudent({ textAnswer: e.target.value })}
                rows={4}
                placeholder={t('practice.saPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-brand-navy outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Feedback (only after submit) */}
        {state.graded && (
          <div
            className={`mt-6 rounded-xl p-4 text-sm ring-1 ring-inset ${
              state.isCorrect ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-red-50 text-red-700 ring-red-200'
            }`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {state.isCorrect ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />}
              {state.isCorrect ? t('practice.correct') : t('practice.notQuite')}
            </p>
            {!state.isCorrect && (
              <p className="mt-2">
                <span className="font-medium">
                  {q.type === 'sa' ? `${t('practice.expectedAnswer')} ` : `${t('practice.correctAnswer')} `}
                </span>
                {q.type === 'mc' && q.options?.[q.correctIndex ?? -1]}
                {q.type === 'tf' && (q.correct ? t('practice.trueLabel') : t('practice.falseLabel'))}
                {q.type === 'sa' && q.answer}
              </p>
            )}
            {q.type === 'sa' && state.feedback && <p className="mt-2">{state.feedback}</p>}
            {q.explanation && (
              <p className="mt-2 text-blue-900/80">
                <span className="font-medium">{`${t('practice.why')} `}</span>
                {q.explanation}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeftIcon width={16} height={16} /> {t('practice.previous')}
          </button>

          {!state.graded ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.grading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t('practice.checking')}
                </>
              ) : (
                t('practice.submit')
              )}
            </button>
          ) : isLast ? (
            <button
              type="button"
              onClick={finish}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              {t('practice.seeResults')} <ArrowRightIcon width={16} height={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {t('practice.next')} <ArrowRightIcon width={16} height={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
