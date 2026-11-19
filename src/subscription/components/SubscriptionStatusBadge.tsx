import type { SubscriptionStatus } from '../types/subscription';

const LABELS: Record<'en' | 'fr', Record<SubscriptionStatus, string>> = {
  en: {
    free: 'Free plan',
    pending_verification: 'Pending verification',
    active: 'Premium · Active',
    expired: 'Expired',
    rejected: 'Payment rejected',
    cancelled: 'Cancelled',
  },
  fr: {
    free: 'Offre gratuite',
    pending_verification: 'Vérification en cours',
    active: 'Premium · Actif',
    expired: 'Expiré',
    rejected: 'Paiement rejeté',
    cancelled: 'Annulé',
  },
};

// navy / white-gray base with green for success, amber for pending (brief §10)
const STYLES: Record<SubscriptionStatus, string> = {
  free: 'bg-gray-100 text-gray-700 ring-gray-300',
  pending_verification: 'bg-amber-50 text-amber-800 ring-amber-300',
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  expired: 'bg-gray-100 text-gray-600 ring-gray-300',
  rejected: 'bg-red-50 text-red-700 ring-red-300',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-300',
};

export function SubscriptionStatusBadge({
  status,
  language = 'en',
}: {
  status: SubscriptionStatus;
  language?: 'en' | 'fr';
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {LABELS[language][status]}
    </span>
  );
}
