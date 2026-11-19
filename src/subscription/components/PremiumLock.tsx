import type { ReactNode } from 'react';
import { lockMessage, type PremiumFeature } from '../lib/accessControl';
import type { AccessState } from '../types/subscription';

/**
 * Wraps a premium feature. When the user is not an active subscriber, the real
 * content is NOT rendered — a lock panel with a Subscribe call-to-action is
 * shown instead. This is a UI hint only; the underlying feature must also be
 * guarded on the server (see subscriptionApi / DB RPC functions).
 */
export function PremiumLock({
  access,
  feature,
  language = 'en',
  onSubscribe,
  children,
}: {
  access: AccessState;
  feature: PremiumFeature;
  language?: 'en' | 'fr';
  onSubscribe: () => void;
  children: ReactNode;
}) {
  if (access.isPremium) return <>{children}</>;

  const label =
    language === 'fr' ? 'Fonctionnalité Premium' : 'Premium feature';

  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
      <div
        aria-hidden
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-900 text-white"
      >
        🔒
      </div>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {label} · {feature}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{lockMessage(language)}</p>
      <button
        type="button"
        onClick={onSubscribe}
        className="mt-4 rounded-xl bg-blue-900 px-4 py-2 font-medium text-white transition hover:bg-blue-800"
      >
        {language === 'fr' ? 'Voir les offres' : 'See plans'}
      </button>
    </div>
  );
}
