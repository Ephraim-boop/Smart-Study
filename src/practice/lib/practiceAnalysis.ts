import type {
  AnswerRecord,
  PracticeMode,
  PracticeQuestion,
  TopicPerformance,
} from '../types';

/**
 * Pure helpers that turn a finished session's answers into honest insight.
 * Everything here is DERIVED from what the student actually answered — no
 * fabricated scores or invented feedback.
 */

/** Accuracy grouped by topic (untagged questions fall under "General"). */
export function computeTopicPerformance(items: AnswerRecord[]): TopicPerformance[] {
  const groups = new Map<string, { correct: number; total: number }>();
  for (const it of items) {
    const key = it.topic?.trim() || 'General';
    const g = groups.get(key) ?? { correct: 0, total: 0 };
    g.total += 1;
    if (it.isCorrect) g.correct += 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .map(([topic, g]) => ({
      topic,
      correct: g.correct,
      total: g.total,
      percent: g.total ? Math.round((g.correct / g.total) * 100) : 0,
    }))
    .sort((a, b) => a.percent - b.percent);
}

/** Concrete, non-generic study suggestions from the real per-topic results. */
export function buildSuggestions(perf: TopicPerformance[], mode: PracticeMode, modeLabel: string): string[] {
  const out: string[] = [];
  const weak = perf.filter((p) => p.percent < 60);
  const strong = perf.filter((p) => p.percent >= 80);

  if (weak.length) {
    const names = weak.map((w) => `"${w.topic}"`).join(', ');
    out.push(`Spend your next revision session on ${names} — those scored lowest.`);
  }
  if (strong.length && strong.length < perf.length) {
    out.push(`You're solid on ${strong.map((s) => `"${s.topic}"`).join(', ')} — skim rather than re-read.`);
  }
  if (!weak.length && perf.length) {
    out.push('Strong across the board. Try a harder difficulty to keep the challenge up.');
  }
  if (mode === 'sa') {
    out.push('For written answers, lead with the key term then explain it in one or two sentences.');
  } else if (mode === 'mc') {
    out.push('On multiple choice, rule out clearly wrong options before choosing.');
  } else if (mode === 'tf') {
    out.push('On true/false, watch for absolutes like "always" or "never" — they often flip the answer.');
  } else {
    out.push(`Mixed practice like this ("${modeLabel}") best mirrors a real exam — keep alternating types.`);
  }
  return out;
}

/** Rebuild AI-shaped questions from a session's MISSED answers for replay. */
export function missedToQuestions(items: AnswerRecord[]): PracticeQuestion[] {
  return items
    .filter((it) => !it.isCorrect)
    .map((it) => ({
      id: `retry_${it.questionId}`,
      type: it.type,
      question: it.question,
      options: it.options,
      correctIndex: it.correctIndex,
      correct: it.correct,
      answer: it.referenceAnswer,
      explanation: it.explanation,
      topic: it.topic,
    }));
}

export function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
