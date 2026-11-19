import { useI18n, type Language } from '../i18n/useI18nExports';
import { LogoIcon } from '../components/icons';

/**
 * Pre-login welcome screen shown ONLY when no language preference exists yet.
 * Choosing English or French persists the selection (localStorage) and reveals
 * the real authentication flow underneath — no page reload.
 */
export function LanguageGate() {
  const { t, setLanguage } = useI18n();

  const options: { lang: Language; flag: string; label: string }[] = [
    { lang: 'en', flag: '🇬🇧', label: t('gate.english') },
    { lang: 'fr', flag: '🇫🇷', label: t('gate.french') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-teal-50/60 via-white to-white font-sans">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-5 sm:px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-white">
          <LogoIcon width={18} height={18} />
        </span>
        <span className="font-serif text-lg font-bold text-brand-navy">StudySmart</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 text-white shadow-sm">
            <LogoIcon width={26} height={26} />
          </div>
          <h1 className="mt-6 font-serif text-3xl font-bold text-brand-navy sm:text-4xl">
            {t('gate.welcome')}
          </h1>
          <p className="mt-3 text-slate-500">{t('gate.choose')}</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {options.map(({ lang, flag, label }) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-brand-navy shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {flag}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
