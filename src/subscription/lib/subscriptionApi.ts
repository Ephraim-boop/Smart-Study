import { getSupabase } from './supabaseClient';
import { COUNTRIES, type CountryCode } from '../config/countries';
import type {
  AccessState,
  PaymentRecord,
  Subscription,
  SubscriptionSettings,
} from '../types/subscription';

/**
 * Client-side API for the subscription module.
 *
 * Every privileged mutation (submitting a payment, verifying/rejecting a
 * payment, editing prices) is delegated to a Postgres `SECURITY DEFINER` RPC
 * that re-checks the caller's role and writes an audit log. The frontend is a
 * convenience layer only — it is never the authoritative gate (Section 7).
 */

// ---- Raw DB row shapes (snake_case) -------------------------------------

interface DbSubscription {
  id: string;
  user_id: string;
  country: CountryCode;
  status: Subscription['status'];
  activation_date: string | null;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

interface DbPayment {
  id: string;
  user_id: string;
  country: CountryCode;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string;
  recipient_number: string;
  status: PaymentRecord['status'];
  rejection_reason: string | null;
  submitted_at: string;
  verified_at: string | null;
  verified_by: string | null;
}

interface DbSettings {
  country: CountryCode;
  monthly_price: number;
  currency: string;
  period_days: number;
  payment_method: string;
  payment_recipient: string;
  enabled: boolean;
}

function mapSubscription(r: DbSubscription): Subscription {
  return {
    id: r.id,
    userId: r.user_id,
    country: r.country,
    status: r.status,
    activationDate: r.activation_date,
    expiryDate: r.expiry_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPayment(r: DbPayment): PaymentRecord {
  return {
    id: r.id,
    userId: r.user_id,
    country: r.country,
    amount: r.amount,
    currency: r.currency,
    paymentMethod: r.payment_method,
    transactionReference: r.transaction_reference,
    recipientNumber: r.recipient_number,
    status: r.status,
    rejectionReason: r.rejection_reason,
    submittedAt: r.submitted_at,
    verifiedAt: r.verified_at,
    verifiedBy: r.verified_by,
  };
}

function mapSettings(r: DbSettings): SubscriptionSettings {
  return {
    country: r.country,
    monthlyPrice: r.monthly_price,
    currency: r.currency,
    periodDays: r.period_days,
    paymentMethod: r.payment_method,
    paymentRecipient: r.payment_recipient,
    enabled: r.enabled,
  };
}

// ---- Reads --------------------------------------------------------------

/** Current user's subscription, with `expired` recomputed from expiry_date. */
export async function fetchMySubscription(): Promise<Subscription | null> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle<DbSubscription>();

  if (error) throw error;
  if (!data) return null;
  return mapSubscription(withComputedExpiry(data));
}

function withComputedExpiry(s: DbSubscription): DbSubscription {
  if (s.status === 'active' && s.expiry_date && new Date(s.expiry_date) < new Date()) {
    return { ...s, status: 'expired' };
  }
  return s;
}

export function deriveAccess(sub: Subscription | null): AccessState {
  if (!sub) return { status: 'free', isPremium: false, expiryDate: null, daysRemaining: 0 };
  const isPremium = sub.status === 'active';
  let daysRemaining = 0;
  if (isPremium && sub.expiryDate) {
    daysRemaining = Math.max(
      0,
      Math.ceil((new Date(sub.expiryDate).getTime() - Date.now()) / 86_400_000),
    );
  }
  return { status: sub.status, isPremium, expiryDate: sub.expiryDate, daysRemaining };
}

/** Public pricing list for the pricing page. Falls back to defaults on error. */
export async function fetchSubscriptionSettings(): Promise<SubscriptionSettings[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('subscription_settings')
    .select('*')
    .eq('enabled', true)
    .order('country')
    .returns<DbSettings[]>();

  if (error) throw error;
  if (data && data.length) return data.map(mapSettings);

  // Fallback so the UI still renders before the DB is seeded.
  return Object.values(COUNTRIES).map((c) => ({
    country: c.code,
    monthlyPrice: c.defaultMonthlyPrice,
    currency: c.currency,
    periodDays: c.defaultPeriodDays,
    paymentMethod: c.paymentMethod,
    paymentRecipient: c.paymentRecipient,
    enabled: true,
  }));
}

export async function fetchSettingsForCountry(
  country: CountryCode,
): Promise<SubscriptionSettings> {
  const all = await fetchSubscriptionSettings();
  const found = all.find((s) => s.country === country);
  if (found) return found;
  const c = COUNTRIES[country];
  return {
    country: c.code,
    monthlyPrice: c.defaultMonthlyPrice,
    currency: c.currency,
    periodDays: c.defaultPeriodDays,
    paymentMethod: c.paymentMethod,
    paymentRecipient: c.paymentRecipient,
    enabled: true,
  };
}

// ---- Student mutations --------------------------------------------------

/**
 * Step 4-5 of the payment procedure: the student submits their Orange Money
 * transaction reference. This creates a `pending_verification` payment record
 * and flags the subscription as pending. It does NOT activate premium access.
 * Duplicate references are rejected server-side.
 */
export async function submitPayment(input: {
  transactionReference: string;
  amountPaid: number;
}): Promise<PaymentRecord> {
  const reference = input.transactionReference.trim();
  if (!reference) {
    throw new Error('A transaction reference is required.');
  }

  const sb = getSupabase();
  const { error } = await sb.rpc('submit_payment', {
    p_transaction_reference: reference,
    p_amount_paid: input.amountPaid,
  });
  if (error) throw error;

  const me = await fetchLatestPendingPayment();
  if (!me) throw new Error('Payment submitted but no record was returned.');
  return me;
}

async function fetchLatestPendingPayment(): Promise<PaymentRecord | null> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from('payment_records')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle<DbPayment>();
  if (error) throw error;
  return data ? mapPayment(data) : null;
}

/** The current user's payment history (own records only, RLS enforced). */
export async function fetchMyPayments(): Promise<PaymentRecord[]> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];
  const { data, error } = await sb
    .from('payment_records')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
    .returns<DbPayment[]>();
  if (error) throw error;
  return data.map(mapPayment);
}

// ---- Admin operations ---------------------------------------------------

export async function adminListPendingPayments(): Promise<PaymentRecord[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('payment_records')
    .select('*')
    .eq('status', 'pending_verification')
    .order('submitted_at', { ascending: true })
    .returns<DbPayment[]>();
  if (error) throw error;
  return data.map(mapPayment);
}

/** Step 6-8: verify a valid payment. Grants `period_days` of premium. */
export async function adminVerifyPayment(paymentId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('admin_verify_payment', { p_payment_id: paymentId });
  if (error) throw error;
}

/** Reject an invalid/duplicate claim with a reason shown to the student. */
export async function adminRejectPayment(
  paymentId: string,
  reason: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('admin_reject_payment', {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

/** Persist administrator-edited price/settings for a country. Admin-only RPC. */
export async function adminUpsertSettings(s: SubscriptionSettings): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('admin_upsert_settings', {
    p_country: s.country,
    p_monthly_price: s.monthlyPrice,
    p_currency: s.currency,
    p_period_days: s.periodDays,
    p_payment_method: s.paymentMethod,
    p_payment_recipient: s.paymentRecipient,
    p_enabled: s.enabled,
  });
  if (error) throw error;
}
