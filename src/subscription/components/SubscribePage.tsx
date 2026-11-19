import { useEffect, useState } from 'react';
import { type CountryCode } from '../config/countries';
import { fetchSettingsForCountry } from '../lib/subscriptionApi';
import { useI18n } from '../../i18n/LanguageProvider';
import type { SubscriptionSettings } from '../types/subscription';
import type { UseSubscriptionResult } from '../hooks/useSubscription';
import { PaymentInstructions } from './PaymentInstructions';
import { SubscribeForm } from './SubscribeForm';

const COPY: Record<'en' | 'fr', { title: string; subtitle: string; loading: string }> = {
  en: {
    title: 'Subscribe and Unlock Premium',
    subtitle:
      'Pay with Orange Money, submit your transaction reference, and unlock all premium study tools once your payment is verified.',
    loading: 'Loading prices…',
  },
  fr: {
    title: 'Souscrire et débloquer Premium',
    subtitle:
      'Payez avec Orange Money, soumettez votre référence de transaction et débloquez tous les outils Premium après vérification.',
    loading: 'Chargement des prix…',
  },
};

/**
 * The "Subscribe and Unlock Premium" page (Section 6). Automatically shows the
 * payment instructions for the student's registered country and lets them
 * submit a reference for verification.
 */
export function SubscribePage({
  country,
  language,
  subscription,
}: {
  country: CountryCode;
  language?: 'en' | 'fr';
  subscription: UseSubscriptionResult;
}) {
  const { language: uiLanguage } = useI18n();
  const lang = language ?? uiLanguage;
  const t = COPY[lang];
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchSettingsForCountry(country)
      .then((s) => active && setSettings(s))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load prices.'));
    return () => {
      active = false;
    };
  }, [country]);

  const isPending = subscription.access.status === 'pending_verification';
  const isActive = subscription.access.isPremium;
  const expiryLabel = subscription.access.expiryDate
    ? new Date(subscription.access.expiryDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')
    : '';

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
      <p className="mt-2 text-gray-600">{t.subtitle}</p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {!settings && !error && <p className="mt-4 text-gray-500">{t.loading}</p>}

      {settings && (
        <div className="mt-6 space-y-6">
          {isPending && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              {lang === 'fr'
                ? 'Votre paiement est en cours de vérification. Le Premium s’activera dès confirmation.'
                : 'Your payment is pending verification. Premium will activate once confirmed by an administrator.'}
            </div>
          )}
          {isActive && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              {lang === 'fr'
                ? `Votre Premium est actif jusqu’au ${expiryLabel}.`
                : `Your Premium is active until ${expiryLabel}. You can renew anytime to extend it.`}
            </div>
          )}

          <PaymentInstructions settings={settings} language={lang} />

          {!isActive && (
            <SubscribeForm
              settings={settings}
              language={lang}
              onSubmit={(ref, amount) => subscription.submitPayment(ref, amount).then(() => undefined)}
            />
          )}
        </div>
      )}
    </section>
  );
}
