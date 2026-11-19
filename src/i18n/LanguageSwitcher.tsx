import { useI18n, type Language } from './useI18nExports';

/**
 * A compact, always-visible EN / FR toggle. Placed in the auth shell header and
 * the landing navbar so a visitor can switch language at any time, before or
 * after logging in. Switching updates every translated string instantly with no
 * page reload.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useI18n();

  const options: { lang: Language; label: string }[] = [
    { lang: 'en', label: 'EN' },
    { lang: 'fr', label: 'FR' },
  ];

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 ${className}`}
    >
      {options.map(({ lang, label }) => {
        const active = language === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={active}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              active ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500 hover:text-brand-navy'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
