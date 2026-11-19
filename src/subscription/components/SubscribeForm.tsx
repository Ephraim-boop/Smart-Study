import { useState, type FormEvent } from 'react';
import { formatPrice } from '../config/countries';
import type { SubscriptionSettings } from '../types/subscription';

const COPY: Record<
  'en' | 'fr',
  {
    title: string;
    reference: string;
    referenceHint: string;
    amount: string;
    submit: string;
    submitting: string;
    success: string;
    required: string;
  }
> = {
  en: {
    title: 'Submit your payment for verification',
    reference: 'Orange Money transaction reference',
    referenceHint: 'The reference/ID shown in your Orange Money confirmation SMS.',
    amount: 'Amount you sent',
    submit: 'Submit for verification',
    submitting: 'Submitting…',
    success: 'Received! Your payment is Pending Verification. Premium unlocks once an administrator confirms it.',
    required: 'Please enter your transaction reference.',
  },
  fr: {
    title: 'Soumettez votre paiement pour vérification',
    reference: 'Référence de la transaction Orange Money',
    referenceHint: 'La référence affichée dans le SMS de confirmation Orange Money.',
    amount: 'Montant envoyé',
    submit: 'Soumettre pour vérification',
    submitting: 'Envoi…',
    success: 'Reçu ! Votre paiement est en cours de vérification. Le Premium s’activera après confirmation par un administrateur.',
    required: 'Veuillez saisir votre référence de transaction.',
  },
};

/**
 * Collects the transaction reference + amount and creates a
 * `pending_verification` payment record via the submit_payment RPC.
 * On success the parent shows the "pending verification" status — premium is
 * NOT activated here (that requires admin verification).
 */
export function SubscribeForm({
  settings,
  language = 'en',
  onSubmit,
}: {
  settings: SubscriptionSettings;
  language?: 'en' | 'fr';
  onSubmit: (reference: string, amountPaid: number) => Promise<void>;
}) {
  const t = COPY[language];
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reference.trim()) {
      setError(t.required);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(reference.trim(), settings.monthlyPrice);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <p className="font-medium">{t.success}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-lg font-semibold text-slate-900">{t.title}</h3>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        {t.reference}
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. OM8F32A91C"
          autoComplete="off"
        />
        <span className="mt-1 block text-xs text-gray-500">{t.referenceHint}</span>
      </label>

      <div className="mt-4 text-sm text-gray-600">
        {t.amount}: <strong>{formatPrice(settings.monthlyPrice, settings.currency)}</strong>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-blue-900 px-4 py-2.5 font-medium text-white transition hover:bg-blue-800 disabled:opacity-60"
      >
        {busy ? t.submitting : t.submit}
      </button>
    </form>
  );
}
