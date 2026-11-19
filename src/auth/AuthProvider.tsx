import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AuthNotConfiguredError,
  fetchProfile,
  getCurrentSession,
  isAuthConfigured,
  onAuthChange,
  requestPasswordReset as apiRequestPasswordReset,
  resendConfirmation as apiResendConfirmation,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
  updatePassword as apiUpdatePassword,
  type AuthUser,
  type Profile,
} from './authService';

interface AuthContextValue {
  /** False when Supabase env vars are missing — the UI must show setup steps. */
  configured: boolean;
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;

  /** Set after sign-up when Supabase is waiting on email confirmation. */
  pendingVerificationEmail: string | null;
  /** True when the user arrived via a password-reset link (recovery session). */
  passwordRecovery: boolean;

  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<string>;
  requestPasswordReset: (email: string) => Promise<string>;
  updatePassword: (newPassword: string) => Promise<void>;
  /** Leave the recovery flow without changing the password. */
  cancelPasswordReset: () => Promise<void>;
  /** Clear the "check your email" verification screen. */
  clearPendingVerification: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = useMemo(() => isAuthConfigured(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // Bootstrap the session + keep it in sync, only when Supabase is configured.
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let active = true;

    void getCurrentSession()
      .then(({ user: u }) => {
        if (!active) return;
        setUser(u);
        // A missing profile row (or a project whose SQL has not been applied
        // yet) must never break sign-in — the student can still use the app.
        if (u) void fetchProfile(u.id).then((p) => active && setProfile(p)).catch(() => undefined);
      })
      .catch((err) => {
        if (err instanceof AuthNotConfiguredError) return;
        if (active) setUser(null);
      })
      .finally(() => active && setLoading(false));

    const unsubscribe = onAuthChange((u, event) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false);
        setPendingVerificationEmail(null);
      }
      setUser(u);
      if (u) void fetchProfile(u.id).then((p) => active && setProfile(p)).catch(() => undefined);
      else setProfile(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [configured]);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const result = await apiSignUp(email, password, fullName);
    if (result.requiresEmailConfirmation) {
      // No session yet — show the "check your email" screen.
      setPendingVerificationEmail(email.trim().toLowerCase());
      return;
    }
    if (result.user) {
      setUser(result.user);
      const p = await fetchProfile(result.user.id).catch(() => null);
      setProfile(p);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await apiSignIn(email, password);
    setUser(u);
    setPendingVerificationEmail(null);
    const p = await fetchProfile(u.id).catch(() => null);
    setProfile(p);
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
    setProfile(null);
    setPasswordRecovery(false);
    setPendingVerificationEmail(null);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    return apiResendConfirmation(email);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    return apiRequestPasswordReset(email);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    await apiUpdatePassword(newPassword);
    // After a successful update the recovery session becomes a normal session.
    setPasswordRecovery(false);
    const u = await getCurrentSession().then((s) => s.user);
    setUser(u);
  }, []);

  const cancelPasswordReset = useCallback(async () => {
    setPasswordRecovery(false);
    setPendingVerificationEmail(null);
    // Drop the one-time recovery session so the next visit asks for credentials.
    try {
      await apiSignOut();
    } catch {
      /* ignore — nothing to sign out of */
    }
    setUser(null);
    setProfile(null);
  }, []);

  const clearPendingVerification = useCallback(() => setPendingVerificationEmail(null), []);

  return (
    <AuthContext.Provider
      value={{
        configured,
        user,
        profile,
        loading,
        pendingVerificationEmail,
        passwordRecovery,
        signUp,
        signIn,
        signOut,
        resendVerification,
        requestPasswordReset,
        updatePassword,
        cancelPasswordReset,
        clearPendingVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}
