/**
 * Shared error vocabulary for every feature that calls the secure AI backend
 * (Smart Summarize, Practice & Improve, Flashcards).
 *
 * WHY THIS EXISTS
 * All three features hit the same backend, and each used to keep its own private
 * list of codes. Anything the list didn't recognise (timeouts, a backend that is
 * not running, an expired session, an out-of-quota key) fell into `unknown`, and
 * the UI translated `unknown` into one generic sentence. Students therefore saw
 * "We couldn't generate your summary right now" for problems that were actually
 * "the AI service is not running" — a message that hides the cause.
 *
 * Here every backend machine-code maps to a DISTINCT app code, and each code has
 * its own translation key, so what the student reads names the real problem.
 */

export type AiErrorCode =
  | 'ai_not_configured' // backend has no AI API key
  | 'not_configured' // Supabase itself is not configured in the app
  | 'unauthorized' // session missing or expired
  | 'auth_unreachable' // could not confirm the session right now
  | 'server_unreachable' // the AI backend is not running / not reachable
  | 'empty_text' // the document had no readable text
  | 'unsupported_format' // file type we cannot read
  | 'too_large' // request exceeded the backend limit
  | 'timeout' // the AI took longer than the whole request budget
  | 'upstream_network' // the backend could not reach the AI provider
  | 'model_unavailable' // provider 5xx / retired model
  | 'no_content' // the AI answered with nothing usable
  | 'bad_json' // the AI answer could not be parsed
  | 'rate_limited' // provider 429 / too many concurrent requests
  | 'quota_exceeded' // provider account out of quota
  | 'network' // the browser could not reach the backend at all
  | 'unknown'; // genuinely unclassified (never used when a cause is known)

/** What the student is doing, used only for wording. */
export type AiFeature = 'summarize' | 'practice' | 'flashcards';

const FEATURE_LABEL: Record<AiFeature, string> = {
  summarize: 'summary',
  practice: 'practice questions',
  flashcards: 'flashcards',
};

// Machine codes returned by server/summarizeServer.mjs and the Edge Functions.
const SERVER_CODES: Record<string, AiErrorCode> = {
  AI_NOT_CONFIGURED: 'ai_not_configured',
  INVALID_KEY: 'ai_not_configured',
  KEY_RESTRICTED: 'ai_not_configured',
  UNAUTHORIZED: 'unauthorized',
  AUTH_UNREACHABLE: 'auth_unreachable',
  AI_BACKEND_DOWN: 'server_unreachable',
  NOT_FOUND: 'not_configured',
  EMPTY_TEXT: 'empty_text',
  UNSUPPORTED_FORMAT: 'unsupported_format',
  TOO_LARGE: 'too_large',
  GENERATION_TIMEOUT: 'timeout',
  UPSTREAM_NETWORK: 'upstream_network',
  MODEL_UNAVAILABLE: 'model_unavailable',
  NO_CONTENT: 'no_content',
  BAD_JSON: 'bad_json',
  RATE_LIMITED: 'rate_limited',
  QUOTA_EXCEEDED: 'quota_exceeded',
  INTERNAL: 'unknown',
};

export function mapServerCode(code: string | undefined): AiErrorCode {
  if (!code) return 'unknown';
  return SERVER_CODES[code] ?? 'unknown';
}

/**
 * Safe, cause-naming English text for a code. The UI translates by code
 * (`<feature>.errors.<code>`), so this is the fallback for callers that render
 * the message directly — it must never be a generic sentence when the cause is
 * known, and must never contain server internals or key material.
 */
export function aiErrorMessage(code: AiErrorCode, feature: AiFeature, serverMessage?: string): string {
  const label = FEATURE_LABEL[feature];
  switch (code) {
    case 'ai_not_configured':
      return 'The AI service has no API key configured. Add GEMINI_API_KEY to server/.env and restart with: npm run dev';
    case 'not_configured':
      return 'The secure AI function is not deployed to Supabase yet. Deploy the AI functions and configure a provider key in Supabase.';
    case 'unauthorized':
      return 'Your sign-in is no longer valid. Please sign in again.';
    case 'auth_unreachable':
      return 'We could not confirm your sign-in right now. Check your internet connection and try again.';
    case 'server_unreachable':
      return 'The AI service on this computer is not reachable. Start it with: npm run dev (or npm run summarize).';
    case 'empty_text':
      return serverMessage?.trim() || 'There was no readable text in those notes. If the file is a scan or a photo, it needs OCR first.';
    case 'unsupported_format':
      return serverMessage?.trim() || 'That file type cannot be read yet. Supported: PDF, DOCX, TXT and Markdown.';
    case 'too_large':
      return serverMessage?.trim() || `Those notes are too long for one request. Select fewer notes and try again.`;
    case 'timeout':
      return `The AI service took too long to answer, so we stopped. Your notes are safe — please try generating the ${label} again.`;
    case 'upstream_network':
      return 'This computer could not reach the AI provider. Check its internet connection and try again.';
    case 'model_unavailable':
      return `The AI model is temporarily unavailable. Your notes are safe — please try again in a moment.`;
    case 'no_content':
      return `The AI did not return a usable result for these notes. Please try again${feature === 'summarize' ? ' — a scanned or mostly-image document often causes this' : ''}.`;
    case 'bad_json':
      return 'The AI returned a response we could not read. Please try again.';
    case 'rate_limited':
      return 'The AI service is busy right now. Please wait a moment and try again.';
    case 'quota_exceeded':
      return 'The AI service has run out of quota for now. Please try again later.';
    case 'network':
      return 'We could not reach the AI service. Check your connection and try again.';
    default:
      // Only truly unclassified failures keep the backend's own safe sentence.
      return serverMessage?.trim() || 'Something went wrong. Please try again.';
  }
}

/** An error that carries one of the shared codes so the UI can branch honestly. */
export class AiError extends Error {
  code: AiErrorCode;
  constructor(message: string, code: AiErrorCode) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}
