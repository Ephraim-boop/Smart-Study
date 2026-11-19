import { useEffect, useState } from 'react';
import { COUNTRIES, type CountryCode } from '../../config/countries';
import { adminUpsertSettings, fetchSubscriptionSettings } from '../../lib/subscriptionApi';
import type { SubscriptionSettings } from '../../types/subscription';

/**
 * Admin price / payment configuration (Sections 3 & 12). Lets authorized staff
 * change the monthly price, currency, period, payment method, and recipient for
 * each country. Writes go through the admin-only `admin_upsert_settings` RPC.
 * Prices are never hardcoded into the student UI — they read from here.
 */
export function PriceSettingsEditor() {
  const [rows, setRows] = useState<Record<CountryCode, SubscriptionSettings> | null>(null);
  const [saving, setSaving] = useState<CountryCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptionSettings().then((list) => {
      const map = {} as Record<CountryCode, SubscriptionSettings>;
      for (const code of Object.keys(COUNTRIES) as CountryCode[]) {
        const c = COUNTRIES[code];
        map[code] =
          list.find((s) => s.country === code) ?? {
            country: code,
            monthlyPrice: c.defaultMonthlyPrice,
            currency: c.currency,
            periodDays: c.defaultPeriodDays,
            paymentMethod: c.paymentMethod,
            paymentRecipient: c.paymentRecipient,
            enabled: true,
          };
      }
      setRows(map);
    });
  }, []);

  function update(code: CountryCode, patch: Partial<SubscriptionSettings>) {
    setRows((prev) => (prev ? { ...prev, [code]: { ...prev[code], ...patch } } : prev));
  }

  async function save(code: CountryCode) {
    if (!rows) return;
    setSaving(code);
    setError(null);
    setMessage(null);
    try {
      await adminUpsertSettings(rows[code]);
      setMessage(`Saved settings for ${COUNTRIES[code].name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(null);
    }
  }

  if (!rows) return <p className="text-gray-500">Loading settings…</p>;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Subscription pricing & payment settings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Changes apply immediately to the pricing and subscribe pages. Confirm the payment provider
        supports each price before publishing.
      </p>

      {message && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 space-y-6">
        {(Object.keys(COUNTRIES) as CountryCode[]).map((code) => {
          const s = rows[code];
          return (
            <fieldset key={code} className="rounded-xl border border-gray-200 p-4">
              <legend className="px-1 font-semibold text-slate-900">{COUNTRIES[code].name}</legend>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="text-gray-600">Monthly price</span>
                  <input
                    type="number"
                    min={0}
                    value={s.monthlyPrice}
                    onChange={(e) => update(code, { monthlyPrice: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Currency</span>
                  <input
                    value={s.currency}
                    onChange={(e) => update(code, { currency: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Period (days)</span>
                  <input
                    type="number"
                    min={1}
                    value={s.periodDays}
                    onChange={(e) => update(code, { periodDays: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Payment method</span>
                  <input
                    value={s.paymentMethod}
                    onChange={(e) => update(code, { paymentMethod: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-gray-600">Recipient number</span>
                  <input
                    value={s.paymentRecipient}
                    onChange={(e) => update(code, { paymentRecipient: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => update(code, { enabled: e.target.checked })}
                  />
                  Offered to students
                </label>
                <button
                  type="button"
                  disabled={saving === code}
                  onClick={() => void save(code)}
                  className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving === code ? 'Saving…' : 'Save'}
                </button>
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
