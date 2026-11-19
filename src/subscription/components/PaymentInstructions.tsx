import { formatPrice } from '../config/countries';
import type { SubscriptionSettings } from '../types/subscription';

const COPY: Record<
  'en' | 'fr',
  {
    title: string;
    steps: string[];
    sendTo: string;
    amount: string;
    method: string;
    important: string;
    noPin: string;
  }
> = {
  en: {
    title: 'Pay with Orange Money',
    steps: [
      'Open your Orange Money app or dial the Orange Money menu on your phone.',
      'Send the exact subscription amount to the recipient number below.',
      'Keep the transaction SMS and note the transaction reference.',
      'Enter that reference in the form and submit it for verification.',
      'Premium unlocks after an administrator verifies your payment — typically within a few hours.',
    ],
    sendTo: 'Send to (recipient number)',
    amount: 'Amount',
    method: 'Payment method',
    important:
      'Your premium access is only activated after an administrator confirms the payment against official Orange Money records. Uploading a screenshot or entering a reference does not grant access by itself.',
    noPin: 'We will never ask for your Orange Money PIN, password, or OTP code.',
  },
  fr: {
    title: 'Payer avec Orange Money',
    steps: [
      'Ouvrez votre application Orange Money ou composez le menu Orange Money sur votre téléphone.',
      'Envoyez le montant exact de l’abonnement au numéro du destinataire ci-dessous.',
      'Conservez le SMS de transaction et notez la référence de la transaction.',
      'Saisissez cette référence dans le formulaire et soumettez-la pour vérification.',
      'Le Premium est activé après vérification par un administrateur — généralement en quelques heures.',
    ],
    sendTo: 'Destinataire (numéro)',
    amount: 'Montant',
    method: 'Méthode de paiement',
    important:
      'Votre accès Premium n’est activé qu’après confirmation du paiement par un administrateur via les registres officiels d’Orange Money. Une capture d’écran ou une référence ne suffit pas.',
    noPin: 'Nous ne demanderons jamais votre code PIN, mot de passe ou code OTP Orange Money.',
  },
};

/**
 * Displays the Orange Money payment instructions for the student's registered
 * country only. The recipient number is rendered exclusively from this
 * country's configured settings (never hardcoded in the page copy).
 */
export function PaymentInstructions({
  settings,
  language = 'en',
}: {
  settings: SubscriptionSettings;
  language?: 'en' | 'fr';
}) {
  const t = COPY[language];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{t.title}</h3>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs uppercase tracking-wide text-gray-500">{t.method}</dt>
          <dd className="mt-1 font-medium text-slate-900">{settings.paymentMethod}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs uppercase tracking-wide text-gray-500">{t.sendTo}</dt>
          <dd className="mt-1 font-mono font-semibold text-blue-900 select-all">
            {settings.paymentRecipient}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs uppercase tracking-wide text-gray-500">{t.amount}</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {formatPrice(settings.monthlyPrice, settings.currency)}
          </dd>
        </div>
      </dl>

      <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-gray-700">
        {t.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
        {t.important}
      </p>
      <p className="mt-2 text-xs text-gray-500">{t.noPin}</p>
    </div>
  );
}
