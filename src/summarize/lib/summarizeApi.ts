import { getSupabase } from '../../subscription/lib/supabaseClient';
import { isAuthConfigured } from '../../auth/authService';
import { aiRoute } from '../../ai/aiRoutes';
import { aiErrorMessage, mapServerCode, type AiErrorCode } from '../../ai/aiErrors';
import {
  SummarizeError,
  type SummarizeRequest,
  type SummaryResult,
} from '../types';

/**
 * Browser client for Smart Summarize.
 *
 * The AI API key lives ONLY on the secure backend (local AI service in dev, or
 * the `summarize-notes` Supabase Edge Function in production), never here. We
 * forward the student's session so the backend can confirm the caller is signed
 * in, and send only the already-extracted text.
 *
 * Every failure leaves this module as a SummarizeError carrying the REAL cause
 * (see src/ai/aiErrors.ts) — never a fake summary and never a raw upstream
 * message that could contain server detail.
 */

// Shape returned by the backend on success.
interface FunctionSuccess {
  ok: true;
  summary: SummaryResult;
  model: string;
}

// Shape returned by the backend on a handled error.
interface FunctionFailure {
  ok: false;
  code?: string;
  message?: string;
}

// The backend bounds each generation with its own budget (AI_DEADLINE_MS, 60s by
// default). Waiting here a little longer means the server's precise diagnosis
// arrives instead of the browser giving up and guessing.
const CLIENT_TIMEOUT_MS = 75_000;

function fail(code: AiErrorCode, serverMessage?: string): never {
  throw new SummarizeError(aiErrorMessage(code, 'summarize', serverMessage), code);
}

/**
 * Generate a real AI summary of the given notes text.
 * Throws a SummarizeError naming the actual cause for every failure mode.
 */
export async function summarizeNotes(request: SummarizeRequest): Promise<SummaryResult> {
  const text = request.text.trim();
  if (!text) {
    fail('empty_text', 'There was no readable text to summarize.');
  }

  // Preferred path: the secure AI backend reached through /ai (dev/preview) or an
  // explicit https:// origin. Falls back to the Supabase Edge Function.
  const endpoint = aiRoute('/summarize');
  if (endpoint) {
    return summarizeViaBackend(endpoint, { ...request, text });
  }

  if (!isAuthConfigured()) {
    fail('not_configured', 'Supabase is not configured, so Smart Summarize cannot run. Complete the setup in SETUP.md first.');
  }

  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke<FunctionSuccess | FunctionFailure>(
    'summarize-notes',
    { body: request },
  );

  // A network / transport-level failure (function not deployed, offline, 5xx).
  if (error) {
    const msg = String((error as { message?: string }).message ?? error).toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network')) {
      fail('network');
    }
    // HTTP errors carry a parsed body on `context` when available.
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof ctx === 'object' && 'json' in ctx) {
      try {
        const body = await (ctx as { json: () => Promise<FunctionFailure> }).json();
        if (body && typeof body.code === 'string') fail(mapServerCode(body.code), body.message);
      } catch (inner) {
        if (inner instanceof SummarizeError) throw inner;
      }
    }
    if (msg.includes('not found') || msg.includes('404')) {
      fail('not_configured', 'The summarize service is not deployed yet. Deploy supabase/functions/summarize-notes (see SETUP.md).');
    }
    fail('network', 'The summarize service is unavailable right now. Please try again.');
  }

  const payload = data as FunctionSuccess | FunctionFailure | null;
  if (!payload || typeof payload !== 'object') {
    fail('unknown', 'The summarize service returned an unexpected response.');
  }
  if (payload.ok === false) {
    const failure = payload as FunctionFailure;
    fail(mapServerCode(failure.code), failure.message);
  }
  const summary = (payload as FunctionSuccess).summary;
  if (!summary || (!summary.mainSummary?.trim() && !summary.keyPoints?.length)) {
    fail('no_content');
  }
  return summary;
}

// Calls a secure summarize backend over HTTPS (the proxied local AI service).
// Forwards the signed-in user's JWT; the backend keeps the AI key server-side and
// returns the same { ok, summary } shape as the Edge Function.
async function summarizeViaBackend(
  endpoint: string,
  request: SummarizeRequest
): Promise<SummaryResult> {
  let token: string | null = null;
  try {
    const { data } = await getSupabase().auth.getSession();
    token = data.session?.access_token ?? null;
  } catch {
    // No session available: the backend will report it as unauthorized rather
    // than silently generating a summary for an unknown caller.
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') fail('timeout');
    fail('server_unreachable');
  }

  let payload: FunctionSuccess | FunctionFailure | null = null;
  try {
    payload = await res.json();
  } catch {
    // A non-JSON body means something in front of the backend answered (proxy
    // error page, captive portal, server not running) — say exactly that.
    fail('server_unreachable', `The AI service answered with an unreadable response (HTTP ${res.status}).`);
  }

  if (!payload || typeof payload !== 'object') {
    fail('server_unreachable', `The AI service answered with an unexpected response (HTTP ${res.status}).`);
  }

  if (!res.ok || payload.ok !== true) {
    const failure = payload as FunctionFailure;
    fail(mapServerCode(failure.code), failure.message);
  }

  const success = payload as FunctionSuccess;
  if (!success.summary) {
    fail('no_content', 'The AI service reported success but returned no summary.');
  }
  const summary = success.summary;
  if (!summary.mainSummary?.trim() && !summary.keyPoints?.length) {
    // Never show an empty "summary" as if it had been generated.
    fail('no_content');
  }
  return summary;
}
