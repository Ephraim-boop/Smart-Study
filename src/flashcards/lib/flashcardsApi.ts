import { getSupabase } from '../../subscription/lib/supabaseClient';
import { isAuthConfigured } from '../../auth/authService';
import { aiRoute } from '../../ai/aiRoutes';
import { aiErrorMessage, mapServerCode } from '../../ai/aiErrors';
import {
  FlashcardsError,
  type Flashcard,
  type GenerateFlashcardsRequest,
} from '../types';

/**
 * Browser client for Flashcards.
 *
 * The AI key lives ONLY on the secure backend, never here. Two backends are
 * supported, mirroring Smart Summarize and Practice exactly:
 *   1. VITE_SUMMARIZE_ENDPOINT set -> the local dev server (same origin, so the
 *      route is <origin>/generate-flashcards)
 *   2. otherwise -> Supabase Edge Function (production)
 * We only ever send already-extracted text; cards are never fabricated here.
 */

interface GenerateSuccess {
  ok: true;
  cards: Omit<Flashcard, 'id'>[];
  model: string;
}
interface Failure {
  ok: false;
  code: string;
  message: string;
}

function mapCode(code: string, message: string): FlashcardsError {
  // Shared vocabulary with Smart Summarize / Practice so the real cause survives.
  const mapped = mapServerCode(code);
  return new FlashcardsError(aiErrorMessage(mapped, 'flashcards', message), mapped);
}

/** Derive a flashcards route on the same secure backend as summarize. */
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

async function throwForResponse(res: Response, fallback: string): Promise<never> {
  let body: Failure | null = null;
  try {
    body = await res.json();
  } catch {
    throw new FlashcardsError(
      aiErrorMessage('server_unreachable', 'flashcards', `${fallback} (HTTP ${res.status}, unreadable response).`),
      'server_unreachable',
    );
  }
  if (body && typeof body.code === 'string') throw mapCode(body.code, body.message ?? '');
  throw new FlashcardsError(`${fallback} (HTTP ${res.status}).`, 'unknown');
}

// The backend stops a stalled generation itself, well inside this ceiling, so
// its precise reason is what the student reads.
const CLIENT_TIMEOUT_MS = 75_000;

/** Generate a real AI flashcard set grounded in the given notes text. */
export async function generateFlashcards(
  request: GenerateFlashcardsRequest,
): Promise<Flashcard[]> {
  const text = request.text.trim();
  if (!text) throw new FlashcardsError('There was no readable text to build flashcards from.', 'empty_text');

  const payload: GenerateFlashcardsRequest = { ...request, text };
  const local = localUrl('/generate-flashcards');

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
      throw new FlashcardsError(aiErrorMessage(code, 'flashcards'), code);
    }
    if (!res.ok) await throwForResponse(res, 'Flashcard generation failed');
    const data = (await res.json()) as GenerateSuccess | Failure;
    if (!data.ok) {
      const f = data as Failure;
      throw mapCode(f.code, f.message);
    }
    return (data as GenerateSuccess).cards.map((c, i) => ({ ...c, id: `c_${Date.now()}_${i}` }));
  }

  // Production path: Supabase Edge Function.
  if (!isAuthConfigured()) {
    throw new FlashcardsError(
      'Supabase is not configured, so Flashcards cannot run. Complete the setup in SETUP.md first.',
      'not_configured',
    );
  }
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke<GenerateSuccess | Failure>('generate-flashcards', {
    body: payload,
  });
  if (error) {
    const msg = String((error as { message?: string }).message ?? error).toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network')) {
      throw new FlashcardsError("We couldn't reach the flashcards service. Check your connection.", 'network');
    }
    if (msg.includes('not found') || msg.includes('404')) {
      throw new FlashcardsError(
        'The flashcards service is not deployed yet. Deploy supabase/functions/generate-flashcards (see SETUP.md).',
        'not_configured',
      );
    }
    throw new FlashcardsError('The flashcards service is unavailable right now. Please try again.', 'network');
  }
  if (!data || data.ok === false) {
    const f = data as Failure | null;
    throw mapCode(f?.code ?? 'unknown', f?.message ?? 'Flashcard generation failed.');
  }
  return data.cards.map((c, i) => ({ ...c, id: `c_${Date.now()}_${i}` }));
}
