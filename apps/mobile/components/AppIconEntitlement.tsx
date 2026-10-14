import { useEffect } from 'react';
import { isPremiumProfile } from '@plot/core/premium.js';
import { useAppData } from '../contexts/AppDataContext';
import { resetAppIconWithoutPremium } from '../lib/appIcons';

/** A signed-in Free account cannot keep a previous account's Premium icon. */
export default function AppIconEntitlement() {
  const { userId, profile } = useAppData();
  useEffect(() => {
    if (userId && profile && !isPremiumProfile(profile)) {
      void resetAppIconWithoutPremium().catch(() => {});
    }
  }, [userId, profile]);
  return null;
}
