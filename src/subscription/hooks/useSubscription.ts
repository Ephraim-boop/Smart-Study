import { useCallback, useEffect, useState } from 'react';
import {
  deriveAccess,
  fetchMySubscription,
  submitPayment as apiSubmitPayment,
} from '../lib/subscriptionApi';
import { getSupabase } from '../lib/supabaseClient';
import type { AccessState, PaymentRecord, Subscription } from '../types/subscription';

export interface UseSubscriptionResult {
  loading: boolean;
  error: string | null;
  subscription: Subscription | null;
  access: AccessState;
  /** Re-pull the subscription from the DB (used after a payment submission). */
  refresh: () => Promise<void>;
  /**
   * Submit an Orange Money transaction reference for verification.
   * Creates a `pending_verification` payment; does NOT grant premium itself.
   */
  submitPayment: (transactionReference: string, amountPaid: number) => Promise<PaymentRecord>;
}

/**
 * Reads the signed-in student's subscription and derives a render-ready access
 * state. Also exposes the manual payment-submission action used by the
 * "Subscribe and Unlock Premium" flow.
 */
export function useSubscription(): UseSubscriptionResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sub = await fetchMySubscription();
      setSubscription(sub);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscription.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // If Supabase env vars are missing we degrade gracefully: the refresh()
    // above already captured the error, so there is nothing to subscribe to.
    let sb: ReturnType<typeof getSupabase> | null = null;
    try {
      sb = getSupabase();
    } catch {
      sb = null;
    }
    if (!sb) return;
    // Keep access state fresh when auth changes (login/logout/user switch).
    const { data } = sb.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const submit = useCallback(
    async (transactionReference: string, amountPaid: number) => {
      const record = await apiSubmitPayment({ transactionReference, amountPaid });
      await refresh();
      return record;
    },
    [refresh],
  );

  return {
    loading,
    error,
    subscription,
    access: deriveAccess(subscription),
    refresh,
    submitPayment: submit,
  };
}
