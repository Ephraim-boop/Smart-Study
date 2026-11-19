/**
 * Where the secure AI backend lives, and whether it is actually up.
 *
 * Smart Summarize, Practice & Improve and Flashcards all call the SAME backend,
 * so route building and the reachability check live here once instead of being
 * copied into each feature (they used to be, and drifted).
 *
 * VITE_SUMMARIZE_ENDPOINT may be:
 *   "/ai/summarize"            -> proxied by the dev/preview server (default)
 *   "http://host:8787/summarize" -> a directly reachable AI backend
 *   unset                      -> Supabase Edge Functions (no local pre-flight)
 */

import type { AiErrorCode } from './aiErrors';

const endpoint = (): string =>
  ((import.meta.env.VITE_SUMMARIZE_ENDPOINT as string | undefined) ?? '').trim();

/** Absolute or root-relative base, e.g. "/ai" or "http://localhost:8787". */
export function aiBase(): string | null {
  const url = endpoint();
  if (!url) return null;
  const withoutSummarize = url.replace(/\/summarize\/?$/, '');
  if (withoutSummarize) return withoutSummarize;
  // Endpoint that isn't a /summarize route: fall back to its origin or folder.
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url.replace(/\/[^/]*$/, '');
  }
}

/** Full URL for one backend route, or null when the Edge Functions are used. */
export function aiRoute(pathname: string): string | null {
  const base = aiBase();
  if (!base) return null;
  return `${base}${pathname}`;
}

export interface AiServiceStatus {
  /** False only when we positively know the backend cannot serve a request. */
  reachable: boolean;
  /** True when a direct local/HTTPS backend answered /health. */
  checked: boolean;
  provider?: string;
  /** True when the backend reports a real AI key (never the key itself). */
  keyConfigured?: boolean;
  /** Shared code so the UI can name the cause in the student's language. */
  code?: AiErrorCode;
  message?: string;
}

const HEALTH_TIMEOUT_MS = 4_000;

/**
 * Asks the backend whether it is alive. Called before a student spends time
 * waiting on a generation, and again periodically, so "the AI service is not
 * running" is reported as that — not as a mystery failure.
 */
export async function checkAiService(): Promise<AiServiceStatus> {
  const health = aiRoute('/health');
  if (!health) {
    // Edge Function mode: there is no health route to probe, so we don't claim
    // anything about the service until an actual request answers.
    return { reachable: true, checked: false };
  }
  try {
    const res = await fetch(health, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      provider?: string;
      keyConfigured?: boolean;
    } | null;
    if (!res.ok || !body) {
      return {
        reachable: false,
        checked: true,
        code: 'server_unreachable',
        message: `The AI service answered incorrectly (HTTP ${res.status}).`,
      };
    }
    return {
      reachable: true,
      checked: true,
      provider: body.provider,
      keyConfigured: body.keyConfigured === true,
      code: body.keyConfigured ? undefined : 'ai_not_configured',
      message: body.keyConfigured
        ? undefined
        : 'The AI service is running but has no API key. Add GEMINI_API_KEY to server/.env and restart.',
    };
  } catch (err) {
    const reason = (err as { name?: string; message?: string })?.message ?? 'unreachable';
    return {
      reachable: false,
      checked: true,
      code: 'server_unreachable',
      message: `The AI service is not reachable at ${health} (${reason}). Run "npm run dev" — it starts the AI backend automatically.`,
    };
  }
}
