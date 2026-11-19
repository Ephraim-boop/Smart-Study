import { getSupabase } from '../subscription/lib/supabaseClient';
import { isAuthConfigured } from '../auth/authService';
import { aiRoute } from '../ai/aiRoutes';
import { mapServerCode, type AiErrorCode } from '../ai/aiErrors';

export type AssignmentSolution = {
  title: string;
  summary: string;
  steps: string[];
  finalAnswer: string;
};

export type AssignmentChatMode =
  | 'standard'
  | 'step_by_step'
  | 'simple'
  | 'detailed'
  | 'final_answer'
  | 'check_answer'
  | 'examples';

export type AssignmentChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssignmentImage = {
  mimeType: string;
  data: string;
};

type AssignmentFailure = {
  ok: false;
  code?: string;
  message?: string;
};

export class AssignmentError extends Error {
  code: AiErrorCode;

  constructor(message: string, code: AiErrorCode) {
    super(message);
    this.name = 'AssignmentError';
    this.code = code;
  }
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

function throwFailure(failure: AssignmentFailure): never {
  const code = mapServerCode(failure.code);
  const fallback: Record<AiErrorCode, string> = {
    ai_not_configured: 'The AI service has no API key configured. Add GEMINI_API_KEY to server/.env and restart.',
    not_configured: 'The assignment solver is not configured. Complete the Supabase setup first.',
    unauthorized: 'Your sign-in is no longer valid. Please sign in again.',
    auth_unreachable: 'We could not confirm your sign-in. Check your connection and try again.',
    server_unreachable: 'The AI service is not reachable. Start it with npm run dev and try again.',
    empty_text: 'There was no readable assignment text to solve.',
    unsupported_format: 'This file type cannot be read. Use a PDF, DOCX, TXT, or Markdown file.',
    too_large: 'This assignment is too long for one request. Try a shorter document.',
    timeout: 'The AI took too long to solve this assignment. Please try again.',
    upstream_network: 'This computer could not reach the AI provider. Check its internet connection.',
    model_unavailable: 'The AI model is temporarily unavailable. Please try again.',
    no_content: 'The AI did not return a usable solution. Please try again.',
    bad_json: 'The AI returned a response we could not read. Please try again.',
    rate_limited: 'The AI service is busy. Please wait a moment and try again.',
    quota_exceeded: 'The AI service has run out of quota for now.',
    network: 'We could not reach the AI service. Check your connection.',
    unknown: 'The assignment could not be solved. Please try again.',
  };
  throw new AssignmentError(failure.message?.trim() || fallback[code], code);
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    const token = await bearerToken();
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(75_000),
    });
  } catch (error) {
    const timedOut = (error as { name?: string })?.name === 'TimeoutError' || (error as { name?: string })?.name === 'AbortError';
    throw new AssignmentError(
      timedOut ? 'The AI took too long to solve this assignment. Please try again.' : 'The AI service is not reachable. Check your connection and try again.',
      timedOut ? 'timeout' : 'server_unreachable',
    );
  }

  let payload: (T & { ok?: boolean }) | AssignmentFailure;
  try {
    payload = await response.json();
  } catch {
    throw new AssignmentError(`The AI service returned an unreadable response (HTTP ${response.status}).`, 'server_unreachable');
  }
  if (!payload || typeof payload !== 'object') {
    throw new AssignmentError(`The AI service returned an unexpected response (HTTP ${response.status}).`, 'server_unreachable');
  }
  if (!response.ok || payload.ok === false) throwFailure(payload as AssignmentFailure);
  return payload as T;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const endpoint = aiRoute('/solve-assignment');
  if (endpoint) return requestJson<T>(endpoint, body);

  if (!isAuthConfigured()) {
    throw new AssignmentError('Supabase is not configured, so the assignment solver cannot run.', 'not_configured');
  }
  const { data, error } = await getSupabase().functions.invoke<T | AssignmentFailure>('solve-assignment', { body });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<AssignmentFailure> } }).context;
    if (context?.json) {
      try {
        throwFailure(await context.json());
      } catch (inner) {
        if (inner instanceof AssignmentError) throw inner;
      }
    }
    throw new AssignmentError('The assignment solver service is unavailable. Please try again.', 'network');
  }
  if (!data || (data as AssignmentFailure).ok === false) throwFailure((data ?? {}) as AssignmentFailure);
  return data as T;
}

export async function sendAssignmentChat(
  messages: AssignmentChatMessage[],
  mode: AssignmentChatMode,
  images: AssignmentImage[] = [],
  language: 'en' | 'fr' = 'en',
): Promise<string> {
  const context = messages.slice(-30).filter((_, index, history) =>
    history.slice(0, index + 1).some((item) => item.role === 'user'),
  );
  if (context.reduce((total, message) => total + message.content.length, 0) > 80_000) {
    throw new AssignmentError('This conversation or its documents are too long to send together. Start a new chat or remove some document text.', 'too_large');
  }
  const imageBytes = images.reduce((total, image) => total + Math.floor(image.data.length * 3 / 4), 0);
  if (images.length > 4 || imageBytes > 3_000_000) {
    throw new AssignmentError('Use up to four JPG, PNG, or WEBP images with 3 MB total per message.', 'unsupported_format');
  }
  const payload = await invoke<{ ok: true; answer: string }>({
    operation: 'chat',
    messages: context,
    mode,
    images,
    language,
  });
  if (!payload.answer?.trim()) {
    throw new AssignmentError('The AI did not return a usable answer. Please try again.', 'no_content');
  }
  return payload.answer.trim();
}

export async function solveAssignment(text: string, sourceName: string): Promise<AssignmentSolution> {
  const payload = await invoke<{ ok: true; solution: AssignmentSolution }>({
    operation: 'solve',
    text,
    sourceName,
  });
  if (!payload.solution?.title || !payload.solution.finalAnswer) {
    throw new AssignmentError('The AI did not return a complete solution. Please try again.', 'no_content');
  }
  return payload.solution;
}

export async function answerAssignmentFollowUp(
  text: string,
  solution: AssignmentSolution,
  question: string,
): Promise<string> {
  const payload = await invoke<{ ok: true; answer: string }>({
    operation: 'follow-up',
    text,
    solution: JSON.stringify(solution),
    question,
  });
  if (!payload.answer?.trim()) throw new AssignmentError('The AI did not return a usable explanation. Please try again.', 'no_content');
  return payload.answer.trim();
}
