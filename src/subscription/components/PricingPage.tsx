import { useEffect, useState } from 'react';
import { COUNTRIES, formatPrice, type CountryCode } from '../config/countries';
import { fetchSubscriptionSettings } from '../lib/subscriptionApi';
import { useI18n } from '../../i18n/LanguageProvider';
import type { SubscriptionSettings } from '../types/subscription';

const COPY: Record<
  'en' | 'fr',
  {
    heading: string;
    free: string;
    freeItems: string[];
    premium: string;
    premiumItems: string[];
    chooseCountry: string;
    subscribe: string;
    currencyNote: string;
  }
> = {
  en: {
    heading: 'Simple monthly pricing for Guinea and Sierra Leone',
    free: 'Free Plan',
    freeItems: [
      'Basic account & dashboard',
      'Limited note analysis',
      'Basic summaries',
      'Limited practice questions',
      'Basic flashcards',
      'Basic progress tracking',
    ],
    premium: 'Premium Monthly Plan',
    premiumItems: [
      'Advanced AI note analysis',
      'Advanced question generation',
      'Full mock examinations',
      'Advanced AI tutoring',
      'Weakness detection & study plan',
      'Spaced-repetition flashcards',
      'Advanced progress reports',
    ],
    chooseCountry: 'Choose your country',
    subscribe: 'Subscribe',
    currencyNote: 'Prices shown in your country’s currency. You confirm the amount before paying.',
  },
  fr: {
    heading: 'Tarification mensuelle simple pour la Guinée et la Sierra Leone',
    free: 'Offre gratuite',
    freeItems: [
      'Compte et tableau de bord de base',
      'Analyse limitée des notes',
      'Résumés de base',
      'Questions d’entraînement limitées',
      'Flashcards de base',
      'Suivi de progression de base',
    ],
    premium: 'Formule Premium mensuelle',
    premiumItems: [
      'Analyse avancée des notes par IA',
      'Génération avancée de questions',
      'Examens blancs complets',
      'Tutorat IA avancé',
      'Détection des lacunes & plan d’études',
      'Flashcards à répétition espacée',
      'Rapports de progression avancés',
    ],
    chooseCountry: 'Choisissez votre pays',
    subscribe: 'Souscrire',
    currencyNote: 'Prix affichés dans la devise de votre pays. Vous confirmez le montant avant de payer.',
  },
};

/**
 * Public pricing page (Section 8): Free vs Premium, with the price shown for
 * the selected country. Does not advertise lifetime, auto-renewal, or unlimited
 * usage — none of those are implemented.
 */
export function PricingPage({
  initialCountry = 'SL',
  language,
  onSubscribe,
}: {
  initialCountry?: CountryCode;
  language?: 'en' | 'fr';
  onSubscribe: (country: CountryCode, settings: SubscriptionSettings) => void;
}) {
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [all, setAll] = useState<SubscriptionSettings[]>([]);
  const { language: uiLanguage } = useI18n();
  const lang = language ?? uiLanguage;
  const t = COPY[lang];

  useEffect(() => {
    fetchSubscriptionSettings()
      .then(setAll)
      .catch(() => setAll([]));
  }, []);

  const selected = COUNTRIES[country];
  const settings =
    all.find((s) => s.country === country) ??
    ({
      country,
      monthlyPrice: selected.defaultMonthlyPrice,
      currency: selected.currency,
      periodDays: selected.defaultPeriodDays,
      paymentMethod: selected.paymentMethod,
      paymentRecipient: selected.paymentRecipient,
      enabled: true,
    } satisfies SubscriptionSettings);

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-center text-2xl font-bold text-slate-900">{t.heading}</h1>

      <div className="mt-6 flex justify-center gap-2">
        {(Object.keys(COUNTRIES) as CountryCode[]).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setCountry(code)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset transition ${
              country === code
                ? 'bg-blue-900 text-white ring-blue-900'
                : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
            }`}
          >
            {COUNTRIES[code].name}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{t.free}</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">{lang === 'fr' ? 'Gratuit' : 'Free'}</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {t.freeItems.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-emerald-600">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Premium */}
        <div className="rounded-2xl border-2 border-blue-900 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{t.premium}</h3>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-blue-900">
              {formatPrice(settings.monthlyPrice, settings.currency, lang)}
            </span>
            <span className="text-sm text-gray-500">{lang === 'fr' ? 'par mois' : 'per month'}</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {t.premiumItems.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-emerald-600">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onSubscribe(country, settings)}
            className="mt-6 w-full rounded-xl bg-blue-900 px-4 py-2.5 font-medium text-white transition hover:bg-blue-800"
          >
            {t.subscribe} · {settings.paymentMethod}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-500">{t.currencyNote}</p>
    </section>
  );
}
