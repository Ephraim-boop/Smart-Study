import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRightIcon, EyeIcon, EyeOffIcon, LogoIcon } from '../components/icons';
import { AuthError, type AuthError as AuthErrorType } from './authService';
import { useAuth } from './AuthProvider';
import { AuthSetupNotice } from './AuthSetupNotice';
import { useI18n } from '../i18n/LanguageProvider';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';

type Mode = 'signup' | 'login' | 'forgot' | 'sent';

/**
 * Messages are stored as a translation spec (a code or a key), NOT a
 * pre-translated string, so an already-displayed message re-renders in the
 * current language when the student switches language mid-screen.
 * `byCode` resolves `auth.errors.<code>` with a safe fallback.
 */
interface MsgSpec {
  key: string;
  byCode?: boolean;
}
interface NoticeSpec {
  key: string;
  email?: string;
}

const inputCls =
  'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

/** Password input with a show/hide toggle so students can verify what they typed. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <label className={`block text-sm font-medium text-brand-navy ${className}`}>
      {label}
      <span className="relative mt-1.5 block">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          {visible ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
        </button>
      </span>
    </label>
  );
}

function isAuthError(e: unknown): e is AuthErrorType {
  return e instanceof AuthError;
}

export function AuthPage() {
  const { t } = useI18n();
  const {
    configured,
    passwordRecovery,
    pendingVerificationEmail,
    signUp,
    signIn,
    resendVerification,
    requestPasswordReset,
    updatePassword,
    cancelPasswordReset,
    clearPendingVerification,
  } = useAuth();

  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<MsgSpec | null>(null);
  const [notice, setNotice] = useState<NoticeSpec | null>(null);
  const [busy, setBusy] = useState(false);

  // Local verify email: set when a login fails with "email not confirmed".
  const [localVerifyEmail, setLocalVerifyEmail] = useState<string | null>(null);
  const verifyEmail = pendingVerificationEmail ?? localVerifyEmail;
  // Remembered so we can VERIFY confirmation when the user taps "I've confirmed".
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);

  // Map a thrown error to a translation spec by its typed code; never leak raw
  // upstream text. Translation happens at render time so it follows the UI language.
  function errorSpec(err: unknown): MsgSpec {
    if (isAuthError(err)) return { key: err.code, byCode: true };
    return { key: 'auth.somethingWentWrong' };
  }

  function renderMsg(spec: MsgSpec | null): string {
    if (!spec) return '';
    if (spec.byCode) {
      const key = `auth.errors.${spec.key}`;
      const translated = t(key);
      return translated !== key ? translated : t('auth.somethingWentWrong');
    }
    return t(spec.key);
  }

  function renderNotice(): string {
    if (!notice) return '';
    const base = t(notice.key);
    return notice.email ? `${base} ${notice.email}.` : base;
  }

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      if (passwordRecovery) {
        if (password !== confirmPassword) {
          setError({ key: 'auth.passwordsDoNotMatch' });
          return;
        }
        await updatePassword(password);
        return; // provider clears recovery + signs the user in on success
      }
      if (mode === 'signup') {
        await signUp(email, password, fullName);
        // Keep the password so the confirm screen can verify the click for real.
        setPendingPassword(password);
        setEmail('');
        setPassword('');
      } else if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        setNotice({ key: 'auth.errors.resetSent' });
        setMode('sent');
      }
      // On successful login/signup the app re-renders past the auth gate.
    } catch (err) {
      if (isAuthError(err) && err.code === 'email_not_confirmed') {
        setLocalVerifyEmail(email.trim().toLowerCase());
        setPendingPassword(password);
        return;
      }
      setError(errorSpec(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!verifyEmail) return;
    resetMessages();
    setBusy(true);
    try {
      await resendVerification(verifyEmail);
      setNotice({ key: 'auth.errors.resendSent', email: verifyEmail });
    } catch (err) {
      setError(isAuthError(err) ? errorSpec(err) : { key: 'auth.couldNotResend' });
    } finally {
      setBusy(false);
    }
  }

  // "I've confirmed" — verify for real by attempting a login. If the email is
  // still unconfirmed, Supabase rejects it and we show a red message.
  async function handleConfirmed() {
    resetMessages();
    const targetEmail = verifyEmail;
    if (!targetEmail) {
      setMode('login');
      return;
    }
    if (!pendingPassword) {
      // No remembered password (e.g. after a refresh) — ask them to log in.
      setLocalVerifyEmail(null);
      clearPendingVerification();
      setMode('login');
      setError({ key: 'auth.loginToContinue' });
      return;
    }
    setBusy(true);
    try {
      await signIn(targetEmail, pendingPassword);
      // Success → the email really was confirmed; the app re-renders past the gate.
      setPendingPassword(null);
      setLocalVerifyEmail(null);
      clearPendingVerification();
    } catch (err) {
      if (isAuthError(err) && err.code === 'email_not_confirmed') {
        setError({ key: 'auth.needToConfirmEmail' });
      } else {
        setError(errorSpec(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    resetMessages();
    setPassword('');
    setConfirmPassword('');
  }

  // ---- verification "check your email" screen ----
  if (configured && verifyEmail) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="font-serif text-3xl font-bold text-brand-navy">{t('auth.titleConfirm')}</h1>
          <p className="mt-2 text-slate-500">
            {t('auth.confirmEmailBody1')}{' '}
            <span className="font-semibold text-brand-navy">{verifyEmail}</span>.{' '}
            {t('auth.confirmEmailBody2')}
          </p>
        </div>

        {notice && <Banner tone="success">{renderNotice()}</Banner>}
        {error && <Banner tone="error">{renderMsg(error)}</Banner>}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-teal-600 disabled:opacity-60"
          >
            {busy ? t('auth.sending') : t('auth.resendEmail')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmed()}
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? t('auth.checking') : t('auth.confirmedBackToLogin')}
          </button>
        </div>
      </Shell>
    );
  }

  // ---- not configured: honest setup steps, never a fake login ----
  if (!configured) {
    return (
      <Shell>
        <AuthSetupNotice />
      </Shell>
    );
  }

  const isRecovery = passwordRecovery;
  const title = isRecovery
    ? t('auth.titleRecovery')
    : mode === 'signup'
      ? t('auth.titleSignup')
      : mode === 'login'
        ? t('auth.titleLogin')
        : mode === 'forgot'
          ? t('auth.titleForgot')
          : t('auth.titleSent');

  const subtitle = isRecovery
    ? t('auth.subRecovery')
    : mode === 'signup'
      ? t('auth.subSignup')
      : mode === 'login'
        ? t('auth.subLogin')
        : mode === 'forgot'
          ? t('auth.subForgot')
          : t('auth.subSent');

  return (
    <Shell>
      <div className="text-center">
        <h1 className="font-serif text-3xl font-bold text-brand-navy sm:text-4xl">{title}</h1>
        <p className="mt-2 text-slate-500">{subtitle}</p>
      </div>

      {/* Sign Up / Log In toggle — hidden during forgot/reset flows */}
      {!isRecovery && mode !== 'forgot' && mode !== 'sent' && (
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === 'signup' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500 hover:text-brand-navy'
            }`}
          >
            {t('auth.signUp')}
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === 'login' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500 hover:text-brand-navy'
            }`}
          >
            {t('auth.logIn')}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {mode === 'signup' && !isRecovery && (
          <label className="block text-sm font-medium text-brand-navy">
            {t('auth.fullName')} <span className="font-normal text-slate-400">{t('auth.optional')}</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder={t('auth.fullNamePlaceholder')}
              className={inputCls}
            />
          </label>
        )}

        {mode !== 'sent' && !isRecovery && (
          <label className={`block text-sm font-medium text-brand-navy ${mode === 'signup' ? 'mt-4' : ''}`}>
            {t('auth.email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              required
              className={inputCls}
            />
          </label>
        )}

        {/* Password fields: full flows for signup/login/recovery only */}
        {(mode === 'signup' || mode === 'login') && !isRecovery && (
          <PasswordField
            label={t('auth.password')}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? t('auth.passwordPlaceholderSignup') : t('auth.passwordPlaceholderLogin')}
            className="mt-4"
          />
        )}

        {isRecovery && (
          <>
            <PasswordField
              label={t('auth.newPassword')}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder={t('auth.passwordPlaceholderSignup')}
            />
            <PasswordField
              label={t('auth.confirmNewPassword')}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              className="mt-4"
            />
          </>
        )}

        {notice && (
          <div className="mt-4">
            <Banner tone="success">{renderNotice()}</Banner>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {renderMsg(error)}
          </p>
        )}

        {mode === 'sent' ? (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 font-semibold text-brand-navy transition hover:bg-slate-50"
          >
            {t('auth.backToLogIn')}
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-teal-600 disabled:opacity-60"
          >
            {busy
              ? t('auth.pleaseWait')
              : isRecovery
                ? t('auth.saveNewPassword')
                : mode === 'signup'
                  ? t('auth.createAccount')
                  : mode === 'login'
                    ? t('auth.logInBtn')
                    : t('auth.sendResetLink')}
            {!busy && mode !== 'forgot' && !isRecovery && <ArrowRightIcon width={18} height={18} />}
          </button>
        )}

        {/* Cross links */}
        {isRecovery ? (
          <p className="mt-3 text-center text-sm text-slate-500">
            <button
              type="button"
              onClick={() => void cancelPasswordReset()}
              className="font-semibold text-teal-600 hover:text-teal-700"
            >
              {t('auth.cancelReset')}
            </button>
          </p>
        ) : mode === 'login' ? (
          <p className="mt-3 text-center text-sm text-slate-500">
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="font-semibold text-teal-600 hover:text-teal-700"
            >
              {t('auth.forgotPassword')}
            </button>
          </p>
        ) : mode === 'signup' ? (
          <p className="mt-3 text-center text-sm text-slate-500">
            {t('auth.haveAccount')}{' '}
            <button type="button" onClick={() => switchMode('login')} className="font-semibold text-teal-600 hover:text-teal-700">
              {t('auth.logInBtn')}
            </button>
          </p>
        ) : (
          <p className="mt-3 text-center text-sm text-slate-500">
            {t('auth.rememberedIt')}{' '}
            <button type="button" onClick={() => switchMode('login')} className="font-semibold text-teal-600 hover:text-teal-700">
              {t('auth.backToLogIn')}
            </button>
          </p>
        )}
      </form>
    </Shell>
  );
}

// ---- presentational helpers ---------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-teal-50/60 via-white to-white font-sans">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-white">
            <LogoIcon width={18} height={18} />
          </span>
          <span className="font-serif text-lg font-bold text-brand-navy">StudySmart</span>
        </div>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'success' | 'error'; children: ReactNode }) {
  const cls =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : 'bg-red-50 text-red-700 ring-red-200';
  return <p className={`mt-4 rounded-lg p-2.5 text-sm ring-1 ring-inset ${cls}`}>{children}</p>;
}
