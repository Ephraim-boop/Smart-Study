import { useState } from 'react';
import { PricingPage } from './subscription/components/PricingPage';
import { PaymentInstructions } from './subscription/components/PaymentInstructions';
import { PremiumLock } from './subscription/components/PremiumLock';
import { SubscriptionStatusBadge } from './subscription/components/SubscriptionStatusBadge';
import { COUNTRIES, type CountryCode } from './subscription/config/countries';
import type { SubscriptionSettings } from './subscription/types/subscription';

const settingsFor = (country: CountryCode): SubscriptionSettings => {
  const c = COUNTRIES[country];
  return {
    country,
    monthlyPrice: c.defaultMonthlyPrice,
    currency: c.currency,
    periodDays: c.defaultPeriodDays,
    paymentMethod: c.paymentMethod,
    paymentRecipient: c.paymentRecipient,
    enabled: true,
  };
};

/**
 * Standalone preview of the subscription module. It renders with the compiled
 * DEFAULT settings so the flow is visible before Supabase is configured; wire
 * useSubscription()/SubscribePage/DashboardSubscriptionCard into your real app
 * to get live, backend-gated behavior.
 */
export function DemoApp() {
  const [country, setCountry] = useState<CountryCode>('SL');
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <header className="bg-blue-950 px-4 py-5 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-bold">StudySmart — Subscription Module Demo</h1>
          <SubscriptionStatusBadge status={unlocked ? 'active' : 'free'} />
        </div>
        <p className="mx-auto mt-1 max-w-4xl text-sm text-blue-200">
          Preview mode: showing configured default prices. Connect Supabase (SETUP.md) for live
          payments + verification.
        </p>
      </header>

      <main className="mx-auto mt-8 max-w-4xl px-4">
        <PricingPage initialCountry={country} onSubscribe={(c) => setCountry(c)} />

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Payment instructions · {COUNTRIES[country].name}
            </h2>
            <PaymentInstructions
              settings={settingsFor(country)}
              language={COUNTRIES[country].language}
            />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Premium gating</h2>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setUnlocked(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              >
                Lock
              </button>
              <button
                type="button"
                onClick={() => setUnlocked(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
              >
                Simulate verified activation
              </button>
            </div>
            <PremiumLock
              access={{
                status: unlocked ? 'active' : 'free',
                isPremium: unlocked,
                expiryDate: null,
                daysRemaining: unlocked ? 30 : 0,
              }}
              feature="mock_examination"
              onSubscribe={() => setCountry(country)}
            >
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
                🎉 Mock examination unlocked. In the real app the active subscription comes from
                <code className="mx-1 rounded bg-white px-1">useSubscription()</code> after an
                administrator verifies the payment.
              </div>
            </PremiumLock>
          </div>
        </div>
      </main>
    </div>
  );
}
