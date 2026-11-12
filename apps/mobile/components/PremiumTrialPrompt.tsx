/**
 * The one-time "Try Premium free for 7 days" prompt on the phone (board card
 * #1). Home mounts it; it does nothing until onboarding finishes or a Trakt
 * import saves titles (requestPremiumTrialPrompt in @plot/core), and it waits
 * while an import sheet holds the screen. Then, once billing has answered, it
 * opens the existing upgrade sheet for a Free member who can still have the
 * trial and whose storefront allows the browser checkout, once per account on
 * this phone. Web's counterpart is apps/web/src/components/PremiumTrialPrompt.jsx.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  PREMIUM_TRIAL_PROMPT_SEEN, onPremiumTrialPromptRequest, peekPremiumTrialPrompt, premiumTrialPromptHeld,
  premiumTrialPromptKey, premiumTrialPromptReason, shouldShowPremiumTrialPrompt, takePremiumTrialPrompt,
  type PremiumTrialPromptTrigger,
} from '@plot/core/premiumTrialPrompt.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { trialEligible } from '@plot/core/billing.js';
import { useBillingStatusResult } from '@plot/core/useBillingStatus.js';
import { track, EVENTS } from '../lib/analytics';
import { readStorage, writeStorage } from '../lib/storage';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';
import { usePremiumCheckout } from '../lib/usePremiumCheckout';
import UpgradeSheet from './UpgradeSheet';

type Profile = { id?: string | null; is_premium?: boolean | null } | null | undefined;

export default function PremiumTrialPrompt({ userId, profile }: { userId: string | null | undefined; profile: Profile }) {
  const [trigger, setTrigger] = useState<PremiumTrialPromptTrigger | null>(() => peekPremiumTrialPrompt());
  const [held, setHeld] = useState(() => premiumTrialPromptHeld());
  useEffect(() => onPremiumTrialPromptRequest((next) => {
    setTrigger(next);
    setHeld(premiumTrialPromptHeld());
  }), []);
  // The billing and storefront reads only start once there is a moment to decide on.
  if (!trigger || held || !userId) return null;
  return <TrialPromptGate key={trigger} userId={userId} profile={profile} trigger={trigger} onDone={() => setTrigger(null)} />;
}

function TrialPromptGate({ userId, profile, trigger, onDone }: {
  userId: string; profile: Profile; trigger: PremiumTrialPromptTrigger; onDone: () => void;
}) {
  const router = useRouter();
  const { data: billing, ready } = useBillingStatusResult(userId);
  const checkout = usePremiumCheckout(true);
  const [open, setOpen] = useState(false);
  const decided = useRef(false);
  const clicked = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (decided.current || !ready) return;
    // No Upgrade button outside storefronts that allow the browser checkout,
    // so no prompt there either. Wait for the storefront read before deciding.
    if (!checkout.allowed && !checkout.storefrontKnown) return;
    decided.current = true;
    takePremiumTrialPrompt();
    const key = premiumTrialPromptKey(userId);
    void (async () => {
      const seen = (await readStorage(key)) === PREMIUM_TRIAL_PROMPT_SEEN;
      const show = checkout.allowed && shouldShowPremiumTrialPrompt({
        seen,
        isPremium: isPremiumProfile(profile) || billing?.isPremium === true,
        trialEligible: trialEligible(billing),
        checkoutOpen: !checkout.closed,
      });
      if (!show) { doneRef.current(); return; }
      await writeStorage(key, PREMIUM_TRIAL_PROMPT_SEEN);
      track(EVENTS.PREMIUM_PROMPT_SHOWN, { trigger });
      setOpen(true);
    })();
  }, [ready, billing, checkout.allowed, checkout.storefrontKnown, checkout.closed, profile, userId, trigger]);

  const reason = premiumTrialPromptReason(trigger);
  if (!open || !reason) return null;

  const onAction = (target: 'checkout' | 'plans', plan?: string) => {
    clicked.current = true;
    track(EVENTS.PREMIUM_PROMPT_CLICKED, { trigger, target, ...(plan ? { plan } : {}) });
  };
  const onClose = () => {
    if (!clicked.current) track(EVENTS.PREMIUM_PROMPT_DISMISSED, { trigger });
    setOpen(false);
    doneRef.current();
  };

  return (
    <UpgradeSheet
      visible
      reason={reason}
      onAction={onAction}
      onClose={onClose}
      onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)}
    />
  );
}
