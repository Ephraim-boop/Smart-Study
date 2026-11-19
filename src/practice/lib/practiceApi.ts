import { getSupabase } from '../../subscription/lib/supabaseClient';
import { isAuthConfigured } from '../../auth/authService';
import { aiRoute } from '../../ai/aiRoutes';
import { aiErrorMessage, mapServerCode } from '../../ai/aiErrors';
import {
  PracticeError,
  type GenerateRequest,
  type GradeRequest,
  type GradeResult,
  type PracticeQuestion,
} from '../types';

/**
 * Browser client for Practice & Improve.
 *
 * The AI key lives ONLY on the secure backend, never here. Two backends are
 * supported, mirroring Smart Summarize exactly:
 *   1. VITE_SUMMARIZE_ENDPOINT set -> the local dev server (same origin, so the
 *      practice routes are <origin>/generate-questions and <origin>/grade-answer)
 *   2. otherwise -> Supabase Edge Functions (production)
 * We only ever send already-extracted text; nothing is fabricated client-side.
 */

interface GenerateSuccess {
  ok: true;
  questions: Omit<PracticeQuestion, 'id'>[];
  model: string;
}
interface GradeSuccess extends GradeResult {
  ok: true;
  model?: string;
}
interface Failure {
  ok: false;
  code: string;
  message: string;
}

function mapCode(code: string, message: string): PracticeError {
  // Same vocabulary as Smart Summarize: the real cause survives, so a student is
  // never told "something went wrong" when the service is simply not running.
  const mapped = mapServerCode(code);
  return new PracticeError(aiErrorMessage(mapped, 'practice', message), mapped);
}

/** Derive a practice route on the same secure backend as summarize. */
function localUrl(pathname: string): string | null {
  return aiRoute(pathname);
}

async function bearerToken(): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// Throw a PracticeError for a non-ok HTTP response, parsing { code, message }.
async function throwForResponse(res: Response, fallback: string): Promise<never> {
  let body: Failure | null = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON answer = whatever sits in front of the backend responded, not the
    // backend itself.
    throw new PracticeError(
      aiErrorMessage('server_unreachable', 'practice', `${fallback} (HTTP ${res.status}, unreadable response).`),
      'server_unreachable',
    );
  }
  if (body && typeof body.code === 'string') throw mapCode(body.code, body.message ?? '');
  throw new PracticeError(`${fallback} (HTTP ${res.status}).`, 'unknown');
}

// Same generous ceiling as Smart Summarize: the backend stops itself first, so
// its precise diagnosis reaches the student instead of a browser guess.
const CLIENT_TIMEOUT_MS = 75_000;

/** Generate a fresh set of AI questions grounded in the given notes text. */
export async function generateQuestions(request: GenerateRequest): Promise<PracticeQuestion[]> {
  const text = request.text.trim();
  if (!text) throw new PracticeError('There was no readable text to build questions from.', 'empty_text');

  const payload: GenerateRequest = { ...request, text };
  const local = localUrl('/generate-questions');

  if (local) {
    const token = await bearerToken();
    let res: Response;
    try {
      res = await fetch(local, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = (err as { name?: string })?.name === 'TimeoutError' || (err as { name?: string })?.name === 'AbortError';
      const code = timedOut ? 'timeout' : 'server_unreachable';
      throw new PracticeError(aiErrorMessage(code, 'practice'), code);
    }
    if (!res.ok) await throwForResponse(res, 'Question generation failed');
    const data = (await res.json()) as GenerateSuccess | Failure;
    if (!data.ok) {
      const f = data as Failure;
      throw mapCode(f.code, f.message);
    }
    return (data as GenerateSuccess).questions.map((q, i) => ({ ...q, id: `q_${Date.now()}_${i}` }));
  }

  // Production path: Supabase Edge Function.
  if (!isAuthConfigured()) {
    throw new PracticeError(
      'Supabase is not configured, so Practice cannot run. Complete the setup in SETUP.md first.',
      'not_configured',
    );
  }
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke<GenerateSuccess | Failure>('generate-questions', {
    body: payload,
  });
  if (error) {
    const msg = String((error as { message?: string }).message ?? error).toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network')) {
      throw new PracticeError("We couldn't reach the practice service. Check your connection.", 'network');
    }
    if (msg.includes('not found') || msg.includes('404')) {
      throw new PracticeError(
        'The practice service is not deployed yet. Deploy supabase/functions/generate-questions (see SETUP.md).',
        'not_configured',
      );
    }
    throw new PracticeError('The practice service is unavailable right now. Please try again.', 'network');
  }
  if (!data || data.ok === false) {
    const f = data as Failure | null;
    throw mapCode(f?.code ?? 'unknown', f?.message ?? 'Question generation failed.');
  }
  return data.questions.map((q, i) => ({ ...q, id: `q_${Date.now()}_${i}` }));
}

/** Grade a free-text short answer on the secure backend (never graded with fake logic). */
export async function gradeShortAnswer(request: GradeRequest): Promise<GradeResult> {
  const local = localUrl('/grade-answer');
  const payload = {
    question: request.question,
    referenceAnswer: request.referenceAnswer,
    studentAnswer: request.studentAnswer,
  };

  if (local) {
    const token = await bearerToken();
    let res: Response;
    try {
      res = await fetch(local, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = (err as { name?: string })?.name === 'TimeoutError' || (err as { name?: string })?.name === 'AbortError';
      const code = timedOut ? 'timeout' : 'server_unreachable';
      throw new PracticeError(aiErrorMessage(code, 'practice'), code);
    }
    if (!res.ok) await throwForResponse(res, 'Grading failed');
    const data = (await res.json()) as GradeSuccess | Failure;
    if (!data.ok) {
      const f = data as Failure;
      throw mapCode(f.code, f.message);
    }
    const g = data as GradeSuccess;
    return { correct: g.correct === true, feedback: g.feedback ?? '' };
  }

  if (!isAuthConfigured()) {
    throw new PracticeError('Supabase is not configured, so Practice cannot run.', 'not_configured');
  }
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke<GradeSuccess | Failure>('grade-answer', { body: payload });
  if (error) {
    throw new PracticeError('The grading service is unavailable right now. Please try again.', 'network');
  }
  if (!data || data.ok === false) {
    const f = data as Failure | null;
    throw mapCode(f?.code ?? 'unknown', f?.message ?? 'Grading failed.');
  }
  return { correct: data.correct === true, feedback: data.feedback ?? '' };
}
