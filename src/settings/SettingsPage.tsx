import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/LanguageProvider';
import type { Language } from '../i18n/LanguageProvider';
import { ArrowLeftIcon, CheckIcon, GlobeIcon, LogOutIcon } from '../components/icons';

/**
 * Settings screen reached from the navbar's Settings button.
 *
 * Language, session, and account controls for the signed-in student.
 */
export function SettingsPage({ onBack }: { onBack: () => void }) {
  const { t, language, setLanguage } = useI18n();
  const { signOut } = useAuth();

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 font-sans text-slate-700">
      {/* Page header — mirrors the study tools' back affordance. */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700"
          >
            <ArrowLeftIcon width={18} height={18} />
          </button>
          <h1 className="min-w-0 break-words font-sans text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">{t('settings.title')}</h1>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-2xl space-y-4 px-3 py-5 sm:space-y-6 sm:px-6 sm:py-8">
        <div className="min-w-0 rounded-[2rem] border border-white/20 bg-slate-50/95 p-4 shadow-2xl backdrop-blur-sm sm:p-6">
        {/* Language */}
        <section className="rounded-2xl bg-white/90 p-4 shadow-card ring-1 ring-slate-200 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <GlobeIcon width={20} height={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-700">{t('settings.language')}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{t('settings.languageHint')}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {languages.map((lang) => {
              const active = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                  }`}
                >
                  {lang.label}
                  {active && <CheckIcon width={18} height={18} className="text-blue-600" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Account / sign out */}
        <section className="rounded-2xl bg-white/90 p-4 shadow-card ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-700">{t('settings.account')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('settings.accountHint')}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <LogOutIcon width={16} height={16} /> {t('settings.signOut')}
          </button>
        </section>

        </div>
      </main>

    </div>
  );
}
