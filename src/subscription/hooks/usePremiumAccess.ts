import { useMemo } from 'react';
import { canAccessPremium, type PremiumFeature } from '../lib/accessControl';
import type { AccessState } from '../types/subscription';

/**
 * Convenience hook for components that need to know whether a specific premium
 * feature is unlocked for the current user.
 *
 * @param access the AccessState from useSubscription()
 */
export function usePremiumAccess(access: AccessState) {
  return useMemo(
    () => ({
      isPremium: access.isPremium,
      can: (feature: PremiumFeature) => canAccessPremium(access, feature),
    }),
    [access],
  );
}
