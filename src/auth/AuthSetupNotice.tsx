import { AlertIcon } from '../components/icons';
import { useI18n } from '../i18n/LanguageProvider';

/**
 * Shown IN PLACE OF the sign-in form when Supabase credentials are missing.
 * This is a deliberate, honest state: the app refuses to pretend a demo account
 * works and instead tells the developer exactly what to configure. Once the
 * env vars are set and the app is rebuilt, the normal auth screen appears.
 */
export function AuthSetupNotice() {
  const { t, tList } = useI18n();
  const steps = tList('setup.steps');

  return (
    <div className="w-full max-w-xl">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-left shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <AlertIcon width={20} height={20} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-bold text-brand-navy">{t('setup.title')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('setup.intro')}</p>
          </div>
        </div>

        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-slate-500 ring-1 ring-inset ring-amber-200">
          {t('setup.walkthrough')} <span className="font-semibold">{t('setup.walkthroughStep')}</span> {t('setup.walkthroughAnd')}{' '}
          <span className="font-semibold">{t('setup.walkthroughStep6')}</span>.
        </p>
      </div>
    </div>
  );
}
