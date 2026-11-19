import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, fr, type Dict } from './translations';

export type Language = 'en' | 'fr';

/** Key under which the chosen language is persisted in localStorage. */
const STORAGE_KEY = 'studysmart.language';

/**
 * Resolve a dot-separated path (e.g. "auth.title.signup") inside a dictionary.
 * Returns undefined when the path does not exist so callers can fall back.
 */
function getPath(source: Dict, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

const DICTS: Record<Language, Dict> = { en, fr };

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** True once the visitor has explicitly chosen a language (or one was restored). */
  hasPreference: boolean;
  /** Translate a dot-path key to a string. Falls back to English, then to the key. */
  t: (key: string) => string;
  /** Translate a dot-path key to a list of strings (features, pricing bullets, steps). */
  tList: (key: string) => string[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'fr') return raw;
  } catch {
    /* localStorage may be unavailable (private mode) — treat as no preference. */
  }
  return null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Restore any previously chosen language on first render (no full-page reload).
  const [language, setLanguageState] = useState<Language>(() => readStoredLanguage() ?? 'en');
  const [hasPreference, setHasPreference] = useState<boolean>(() => readStoredLanguage() !== null);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setHasPreference(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore persistence failures; in-memory language still updates */
    }
    // Keep <html lang> in sync for accessibility without reloading the page.
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, []);

  // Reflect the active language on the document root whenever it changes.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string): string => {
      const local = getPath(DICTS[language], key);
      if (typeof local === 'string') return local;
      const fallback = getPath(DICTS.en, key);
      return typeof fallback === 'string' ? fallback : key;
    },
    [language],
  );

  const tList = useCallback(
    (key: string): string[] => {
      const local = getPath(DICTS[language], key);
      if (Array.isArray(local)) return local as string[];
      const fallback = getPath(DICTS.en, key);
      return Array.isArray(fallback) ? (fallback as string[]) : [];
    },
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, hasPreference, t, tList }),
    [language, setLanguage, hasPreference, t, tList],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used within a LanguageProvider.');
  return ctx;
}
