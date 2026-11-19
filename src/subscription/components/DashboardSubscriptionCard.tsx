import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';
import type { UseSubscriptionResult } from '../hooks/useSubscription';
import { useI18n } from '../../i18n/LanguageProvider';
import { formatPrice, COUNTRIES } from '../config/countries';

const COPY: Record<
  'en' | 'fr',
  {
    account: string;
    status: string;
    activated: string;
    expires: string;
    daysLeft: string;
    renew: string;
    subscribe: string;
    pendingNote: string;
    rejectedNote: string;
    expiredNote: string;
  }
> = {
  en: {
    account: 'Subscription',
    status: 'Status',
    activated: 'Activated',
    expires: 'Expires',
    daysLeft: 'days remaining',
    renew: 'Renew subscription',
    subscribe: 'Subscribe to Premium',
    pendingNote: 'We are verifying your payment. Premium unlocks automatically once approved.',
    rejectedNote: 'Your payment could not be verified. Please contact support or try again.',
    expiredNote: 'Your plan is back to Free. Your saved notes and results are untouched — renew to unlock Premium again.',
  },
  fr: {
    account: 'Abonnement',
    status: 'Statut',
    activated: 'Activé le',
    expires: 'Expire le',
    daysLeft: 'jours restants',
    renew: 'Renouveler l’abonnement',
    subscribe: 'S’abonner à Premium',
    pendingNote: 'Votre paiement est en cours de vérification. Le Premium s’activera une fois approuvé.',
    rejectedNote: 'Votre paiement n’a pas pu être vérifié. Contactez l’assistance ou réessayez.',
    expiredNote: 'Votre offre est repassée en Gratuit. Vos notes et résultats sont conservés — renouvelez pour débloquer Premium.',
  },
};

function fmtDate(iso: string | null, lang: 'en' | 'fr'): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB');
}

/**
 * Dashboard subscription widget: shows status label, activation + expiry dates,
 * days remaining, and a renew/subscribe action. Never removes saved work.
 */
export function DashboardSubscriptionCard({
  subscription,
  country,
  language,
  onSubscribe,
}: {
  subscription: UseSubscriptionResult;
  country: keyof typeof COUNTRIES;
  language?: 'en' | 'fr';
  onSubscribe: () => void;
}) {
  const { language: uiLanguage } = useI18n();
  const lang = language ?? uiLanguage;
  const t = COPY[lang];
  const { access } = subscription;
  const sub = subscription.subscription;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t.account}</h2>
        <SubscriptionStatusBadge status={access.status} language={lang} />
      </div>

      {access.isPremium && (
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">{t.activated}</dt>
            <dd className="font-medium text-slate-900">{fmtDate(sub?.activationDate ?? null, lang)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t.expires}</dt>
            <dd className="font-medium text-slate-900">
              {fmtDate(access.expiryDate, lang)}{' '}
              <span className="text-gray-500">
                ({access.daysRemaining} {t.daysLeft})
              </span>
            </dd>
          </div>
        </dl>
      )}

      {access.status === 'pending_verification' && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.pendingNote}</p>
      )}
      {access.status === 'rejected' && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t.rejectedNote}</p>
      )}
      {access.status === 'expired' && (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{t.expiredNote}</p>
      )}

      {!access.isPremium && (
        <button
          type="button"
          onClick={onSubscribe}
          className="mt-5 rounded-xl bg-blue-900 px-4 py-2.5 font-medium text-white transition hover:bg-blue-800"
        >
          {access.status === 'expired' ? t.renew : t.subscribe} ·{' '}
          {formatPrice(COUNTRIES[country].defaultMonthlyPrice, COUNTRIES[country].currency, lang)}
        </button>
      )}

      {access.isPremium && (
        <button
          type="button"
          onClick={onSubscribe}
          className="mt-5 rounded-xl border border-blue-900 px-4 py-2.5 font-medium text-blue-900 transition hover:bg-blue-50"
        >
          {t.renew}
        </button>
      )}
    </div>
  );
}
