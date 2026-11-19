import type { CountryCode } from '../config/countries';

/**
 * Subscription lifecycle states (Section 7 of the brief).
 * Stored on `subscriptions.status` and surfaced in the dashboard.
 */
export type SubscriptionStatus =
  | 'free'
  | 'pending_verification'
  | 'active'
  | 'expired'
  | 'rejected'
  | 'cancelled';

/** Payment record lifecycle. Premium is only ever granted on `verified`. */
export type PaymentStatus = 'pending_verification' | 'verified' | 'rejected';

/** A student's subscription row (already normalized for the client). */
export interface Subscription {
  id: string;
  userId: string;
  country: CountryCode;
  status: SubscriptionStatus;
  /** Set only while premium is active. */
  activationDate: string | null; // ISO datetime
  /** Premium access ends at this timestamp; empty UI must treat past dates as expired. */
  expiryDate: string | null; // ISO datetime
  createdAt: string;
  updatedAt: string;
}

/** A submitted Orange Money payment claim awaiting admin verification. */
export interface PaymentRecord {
  id: string;
  userId: string;
  country: CountryCode;
  amount: number;
  currency: string;
  paymentMethod: string;
  /** Student-supplied Orange Money transaction reference (unique). */
  transactionReference: string;
  recipientNumber: string;
  status: PaymentStatus;
  /** Optional admin note explaining a rejection. */
  rejectionReason: string | null;
  submittedAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

/** Administrator-configurable per-country pricing / payment settings. */
export interface SubscriptionSettings {
  country: CountryCode;
  monthlyPrice: number;
  currency: string;
  periodDays: number;
  paymentMethod: string;
  paymentRecipient: string;
  /** Whether this plan is currently offered to students. */
  enabled: boolean;
}

/** Derived, render-ready view of a student's access state. */
export interface AccessState {
  status: SubscriptionStatus;
  isPremium: boolean;
  expiryDate: string | null;
  /** Days remaining, clamped to >= 0, when active. */
  daysRemaining: number;
}
