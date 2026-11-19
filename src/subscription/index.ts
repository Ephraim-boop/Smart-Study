/**
 * StudySmart subscription module — public entry point.
 * Import what you need from here when wiring the module into the app.
 */
export * from './config/countries';
export { PREMIUM_ENABLED } from './config/featureFlags';
export * from './types/subscription';
export * from './lib/accessControl';
export {
  deriveAccess,
  fetchMySubscription,
  fetchSubscriptionSettings,
  fetchSettingsForCountry,
  fetchMyPayments,
  submitPayment,
  adminListPendingPayments,
  adminVerifyPayment,
  adminRejectPayment,
  adminUpsertSettings,
} from './lib/subscriptionApi';
export { useSubscription, type UseSubscriptionResult } from './hooks/useSubscription';
export { usePremiumAccess } from './hooks/usePremiumAccess';
export { PricingPage } from './components/PricingPage';
export { SubscribePage } from './components/SubscribePage';
export { SubscribeForm } from './components/SubscribeForm';
export { PaymentInstructions } from './components/PaymentInstructions';
export { PlanCard } from './components/PlanCard';
export { PremiumLock } from './components/PremiumLock';
export { SubscriptionStatusBadge } from './components/SubscriptionStatusBadge';
export { DashboardSubscriptionCard } from './components/DashboardSubscriptionCard';
export { PendingPaymentsTable } from './components/admin/PendingPaymentsTable';
export { PriceSettingsEditor } from './components/admin/PriceSettingsEditor';
