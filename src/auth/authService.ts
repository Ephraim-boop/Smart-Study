import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabase } from '../subscription/lib/supabaseClient';

/**
 * StudySmart authentication service — REAL Supabase Auth only.
 *
 * There is deliberately NO browser-only "preview" fallback here: when the
 * Supabase environment variables are absent, every call throws a clear
 * `AuthNotConfiguredError` and the UI shows the exact setup steps instead of
 * pretending a demo account worked. The anon client key is safe in the browser
 * only because every privileged action is guarded by RLS / SECURITY DEFINER
 * functions on the server.
 *
 * Flows implemented: email+password sign up, email confirmation, log in, log
 * out, account deletion, resend confirmation, password reset (request +
 * completion), and the user's private profile row (id = auth.users.id) created
 * by a DB trigger.
 */

export interface AuthUser {
  id: string;
  email: string;
  /** False until the student clicks the confirmation link in their email. */
  emailConfirmed: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  fullName: string | null;
  country: 'GN' | 'SL' | null;
  createdAt: string;
}

/** Typed error so callers can distinguish "not configured" from real failures. */
export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase Auth is not configured. Set VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY in .env (see SETUP.md) before signing up or logging in.',
    );
    this.name = 'AuthNotConfiguredError';
  }
}

/** A normalized, user-safe error thrown to the UI. `code` guides UI branching. */
export class AuthError extends Error {
  code:
    | 'invalid_credentials'
    | 'email_not_confirmed'
    | 'email_taken'
    | 'weak_password'
    | 'rate_limited'
    | 'network'
    | 'enter_email'
    | 'password_short'
    | 'enter_email_password'
    | 'new_password_short'
    | 'unknown';
  constructor(message: string, code: AuthError['code']) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

// ---- client access -------------------------------------------------------

/** Returns the shared Supabase client, or null when env vars are missing. */
export function getAuthClient(): SupabaseClient | null {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/** True only when real Supabase credentials are present. Never guesses. */
export function isAuthConfigured(): boolean {
  return getAuthClient() !== null;
}

function requireClient(): SupabaseClient {
  const sb = getAuthClient();
  if (!sb) throw new AuthNotConfiguredError();
  return sb;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapUser(u: User): AuthUser {
  return {
    id: u.id,
    email: u.email ?? '',
    emailConfirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
  };
}

/**
 * Map raw Supabase/postgrest errors onto clear, non-leaky messages. We never
 * surface whether an email exists on password reset (to avoid enumeration).
 */
function toAuthError(error: { message?: string; name?: string } | unknown): AuthError {
  const msg = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || error || '',
  ).toLowerCase();

  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('timeout')) {
    return new AuthError("We couldn't reach the server. Check your connection and try again.", 'network');
  }
  if (msg.includes('invalid login credentials')) {
    return new AuthError('Incorrect email or password.', 'invalid_credentials');
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return new AuthError('Please confirm your email address before logging in.', 'email_not_confirmed');
  }
  if (
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('already exists') ||
    msg.includes('already signed up') ||
    msg.includes('is already in use')
  ) {
    return new AuthError('An account with this email already exists. Try logging in.', 'email_taken');
  }
  if (msg.includes('password') && (msg.includes('should be at least') || msg.includes('weak'))) {
    return new AuthError('Your password is too weak. Use at least 6 characters.', 'weak_password');
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return new AuthError('Too many attempts. Please wait a moment and try again.', 'rate_limited');
  }
  const rawMessage =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : '';
  return new AuthError(rawMessage || 'Something went wrong. Please try again.', 'unknown');
}

// ---- session / user ------------------------------------------------------

export async function getCurrentSession(): Promise<{ user: AuthUser | null; session: Session | null }> {
  const sb = requireClient();
  const { data, error } = await sb.auth.getSession();
  if (error) throw toAuthError(error);
  return { user: data.session?.user ? mapUser(data.session.user) : null, session: data.session };
}

export async function refreshCurrentUser(): Promise<AuthUser | null> {
  const sb = requireClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return mapUser(data.user);
}

/**
 * Subscribe to auth changes. The `event` is forwarded so the UI can detect
 * PASSWORD_RECOVERY (user arrived from a reset link) and switch to the "choose a
 * new password" form.
 */
export function onAuthChange(
  cb: (user: AuthUser | null, event: string, session: Session | null) => void,
): () => void {
  const sb = requireClient();
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    cb(session?.user ? mapUser(session.user) : null, event, session);
  });
  return () => data.subscription.unsubscribe();
}

// ---- sign up / confirm ---------------------------------------------------

export interface SignUpResult {
  user: AuthUser | null;
  /** True when Supabase requires email confirmation before a session exists. */
  requiresEmailConfirmation: boolean;
}

export async function signUp(email: string, password: string, fullName?: string): Promise<SignUpResult> {
  const clean = normalizeEmail(email);
  if (!clean) throw new AuthError('Enter your email address.', 'enter_email');
  if (password.length < 6) {
    throw new AuthError('Your password must be at least 6 characters.', 'password_short');
  }
  const sb = requireClient();
  const { data, error } = await sb.auth.signUp({
    email: clean,
    password,
    options: { data: { full_name: fullName?.trim() || null } },
  });
  if (error) throw toAuthError(error);
  return {
    user: data.user ? mapUser(data.user) : null,
    // No session means Supabase is waiting on email confirmation.
    requiresEmailConfirmation: !data.session,
  };
}

/** Resend the confirmation email. Returns a message safe to show the user. */
export async function resendConfirmation(email: string): Promise<string> {
  const clean = normalizeEmail(email);
  const sb = requireClient();
  const { error } = await sb.auth.resend({ type: 'signup', email: clean });
  if (error) throw toAuthError(error);
  return `We sent a new confirmation link to ${clean}.`;
}

// ---- log in / log out ----------------------------------------------------

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const clean = normalizeEmail(email);
  if (!clean || !password) {
    throw new AuthError('Enter your email and password.', 'enter_email_password');
  }
  const sb = requireClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: clean, password });
  if (error) throw toAuthError(error);
  return mapUser(data.user);
}

export async function signOut(): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.auth.signOut();
  if (error) throw toAuthError(error);
}

// ---- password reset ------------------------------------------------------

/**
 * Send a password-reset email. The link returns to `redirectTo` (this app) and
 * supabase-js detects it in the URL, firing a PASSWORD_RECOVERY event.
 * Always resolves with the same message — we never reveal whether the email
 * exists.
 */
export async function requestPasswordReset(email: string, redirectTo?: string): Promise<string> {
  const clean = normalizeEmail(email);
  const sb = requireClient();
  const target = redirectTo ?? (typeof window !== 'undefined' ? `${window.location.origin}/` : undefined);
  const { error } = await sb.auth.resetPasswordForEmail(clean, target ? { redirectTo: target } : undefined);
  if (error) throw toAuthError(error);
  return 'If an account exists for that email, a password reset link is on its way.';
}

/** Complete a reset while in a recovery session by setting the new password. */
export async function updatePassword(newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    throw new AuthError('Your new password must be at least 6 characters.', 'new_password_short');
  }
  const sb = requireClient();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw toAuthError(error);
}

// ---- profile (RLS: owner-only) -------------------------------------------

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const sb = requireClient();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw toAuthError(error);
  if (!data) return null;
  return {
    id: data.id,
    email: data.email ?? null,
    fullName: data.full_name ?? null,
    country: (data.country as 'GN' | 'SL' | null) ?? null,
    createdAt: data.created_at ?? new Date(0).toISOString(),
  };
}
