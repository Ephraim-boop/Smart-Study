/**
 * Subscription feature flags.
 *
 * Premium subscriptions (pricing, Orange Money payment instructions and the
 * checkout flow) are temporarily turned OFF while the Orange Money integration
 * is being approved. Nothing here deletes the underlying system: the pricing /
 * subscribe / payment components, the `subscription_*` database tables and the
 * payment-verification logic all stay in place.
 *
 * To bring Premium back, flip PREMIUM_ENABLED to `true`. The landing page will
 * render the real pricing section again and stop showing the "coming soon"
 * notice. Keep this flag as the single switch for the whole feature.
 */
export const PREMIUM_ENABLED = false;
