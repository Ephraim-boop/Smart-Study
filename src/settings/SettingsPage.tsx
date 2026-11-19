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
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700"
          >
            <ArrowLeftIcon width={18} height={18} />
          </button>
          <h1 className="font-sans text-xl font-extrabold tracking-tight text-slate-900">{t('settings.title')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-[2rem] border border-white/20 bg-slate-50/95 p-6 shadow-2xl backdrop-blur-sm">
        {/* Language */}
        <section className="rounded-2xl bg-white/90 p-6 shadow-card ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <GlobeIcon width={20} height={20} />
            </span>
            <div>
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
        <section className="rounded-2xl bg-white/90 p-6 shadow-card ring-1 ring-slate-200">
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
