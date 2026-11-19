/**
 * Country definitions for StudySmart subscriptions.
 *
 * These are compile-time DEFAULTS used to render the UI before the
 * administrator-configured values are loaded from the database. The database
 * table `subscription_settings` (see /supabase/migrations) is the source of
 * truth at runtime, so prices, currency, and recipients stay configurable in
 * the admin dashboard without code changes.
 */

export type CountryCode = 'GN' | 'SL';

export interface CountryConfig {
  /** ISO 3166-1 alpha-2 code used as the join key against the DB. */
  code: CountryCode;
  /** Display name in English. */
  name: string;
  /** Default interface language (BCP 47) per the project brief. */
  language: 'fr' | 'en';
  /** ISO 4217 currency code shown to and stored for the student. */
  currency: 'GNF' | 'SLE';
  /** Mobile-money provider name shown in the payment instructions. */
  paymentMethod: string;
  /**
   * Orange Money recipient number supplied by the site owner.
   * Preserve EXACTLY as configured. Only shown for this country.
   */
  paymentRecipient: string;
  /** Default monthly price in the smallest displayed unit (no sub-units here). */
  defaultMonthlyPrice: number;
  /** Default premium period granted after a verified payment (days). */
  defaultPeriodDays: number;
}

/**
 * NOTE ON CURRENCY (Sierra Leone):
 * Sierra Leone redenominated in 2022; 1 SLE (new leone) = 1000 SLL (old leone).
 * The value below uses SLE and is intentionally kept configurable so the owner
 * can confirm/correct the denomination from the admin dashboard without editing
 * code. Guinea uses 20,000 GNF per month as specified.
 */
export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  GN: {
    code: 'GN',
    name: 'Guinea',
    language: 'fr',
    currency: 'GNF',
    paymentMethod: 'Orange Money Guinée',
    paymentRecipient: '+22461132905',
    defaultMonthlyPrice: 20000,
    defaultPeriodDays: 30,
  },
  SL: {
    code: 'SL',
    name: 'Sierra Leone',
    language: 'en',
    currency: 'SLE',
    paymentMethod: 'Orange Money Sierra Leone',
    paymentRecipient: '+232079960361',
    defaultMonthlyPrice: 20,
    defaultPeriodDays: 30,
  },
};

export const COUNTRY_LIST: CountryConfig[] = Object.values(COUNTRIES);

/**
 * Formats a price with its currency for display. Both GNF and SLE are shown
 * without minor units (no decimals), matching how they are advertised.
 */
export function formatPrice(amount: number, currency: string, locale = 'en'): string {
  const rounded = Math.round(amount);
  const grouped = rounded.toLocaleString(locale);
  return `${grouped} ${currency}`;
}
