import { formatPrice } from '../config/countries';
import type { SubscriptionSettings } from '../types/subscription';

const COPY: Record<
  'en' | 'fr',
  { premium: string; perMonth: string; cta: string; features: string[] }
> = {
  en: {
    premium: 'Premium Monthly',
    perMonth: 'per month',
    cta: 'Subscribe & Unlock Premium',
    features: [
      'Advanced AI note analysis',
      'Advanced question generation',
      'Full mock examinations',
      'Advanced AI tutoring',
      'Weakness detection & study plan',
      'Spaced-repetition flashcards',
      'Advanced progress reports',
    ],
  },
  fr: {
    premium: 'Premium Mensuel',
    perMonth: 'par mois',
    cta: 'Souscrire et débloquer Premium',
    features: [
      'Analyse avancée des notes par IA',
      'Génération avancée de questions',
      'Examens blancs complets',
      'Tutorat IA avancé',
      'Détection des lacunes & plan d’études',
      'Flashcards à répétition espacée',
      'Rapports de progression avancés',
    ],
  },
};

/**
 * Renders the country-specific Premium plan card. The price + currency come
 * from administrator settings (never hardcoded at render time), satisfying
 * "clearly display the applicable currency and monthly price before students pay."
 */
export function PlanCard({
  settings,
  language = 'en',
  onSelect,
}: {
  settings: SubscriptionSettings;
  language?: 'en' | 'fr';
  onSelect: (settings: SubscriptionSettings) => void;
}) {
  const t = COPY[language];
  if (!settings.enabled) return null;
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{t.premium}</h3>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-blue-900">
          {formatPrice(settings.monthlyPrice, settings.currency)}
        </span>
        <span className="text-sm text-gray-500">{t.perMonth}</span>
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-700">
        {t.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="text-emerald-600">
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onSelect(settings)}
        className="mt-6 rounded-xl bg-blue-900 px-4 py-2.5 font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {t.cta}
      </button>
    </div>
  );
}
