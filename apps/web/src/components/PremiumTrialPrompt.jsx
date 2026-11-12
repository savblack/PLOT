// The one-time "Try Premium free for 7 days" prompt (board card #1). Mounted
// in the app shell; it does nothing until onboarding finishes or a Trakt
// import saves titles (requestPremiumTrialPrompt in @plot/core). Then, once
// billing has answered, it opens the existing upgrade sheet for a Free member
// who can still have the trial, and never again on this device for that
// account. The sheet's own button goes to the existing Checkout with the
// trial. Mobile's counterpart is apps/mobile/components/PremiumTrialPrompt.tsx.
import { useEffect, useRef, useState } from 'react';
import {
  PREMIUM_TRIAL_PROMPT_SEEN, onPremiumTrialPromptRequest, peekPremiumTrialPrompt, premiumTrialPromptKey,
  premiumTrialPromptReason, shouldHoldPremiumTrialPrompt, shouldShowPremiumTrialPrompt, takePremiumTrialPrompt,
} from '@plot/core/premiumTrialPrompt.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { EVENTS, track } from '../lib/analytics.js';
import { usePremium } from '../hooks/usePremium.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { UpgradeSheetView } from './UpgradeSheet.jsx';

/** @param {{ profile: { id: string, is_premium?: boolean } | null | undefined, currentView?: string | null }} props */
export default function PremiumTrialPrompt({ profile, currentView }) {
  const [trigger, setTrigger] = useState(() => peekPremiumTrialPrompt());
  useEffect(() => onPremiumTrialPromptRequest(setTrigger), []);
  // The billing reads only start once there is a moment to decide on, so the
  // shell does not ask for billing status on every page load.
  if (!trigger || !profile?.id || shouldHoldPremiumTrialPrompt(trigger, currentView)) return null;
  return <TrialPromptGate key={trigger} profile={profile} trigger={trigger} onDone={() => setTrigger(null)} />;
}

/**
 * @param {{ profile: { id: string, is_premium?: boolean }, trigger: import('@plot/core/premiumTrialPrompt.js').PremiumTrialPromptTrigger, onDone: () => void }} props
 */
export function TrialPromptGate({ profile, trigger, onDone }) {
  const premium = usePremium(profile);
  const [open, setOpen] = useState(false);
  const decided = useRef(false);
  const clicked = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (decided.current) return;
    // Wait for the first billing read: until then trialEligible means "not known".
    if (premium.billingReady === false) return;
    decided.current = true;
    takePremiumTrialPrompt();
    const key = premiumTrialPromptKey(profile.id);
    const show = shouldShowPremiumTrialPrompt({
      seen: readStorage(key) === PREMIUM_TRIAL_PROMPT_SEEN,
      isPremium: isPremiumProfile(profile) || premium.isPremium,
      trialEligible: premium.trialEligible,
      checkoutOpen: premium.checkoutAvailable !== false,
    });
    if (!show) { doneRef.current(); return; }
    // Seen as soon as it shows, so a reload mid-prompt never shows it twice.
    writeStorage(key, PREMIUM_TRIAL_PROMPT_SEEN);
    track(EVENTS.PREMIUM_PROMPT_SHOWN, { trigger });
    setOpen(true);
  }, [premium.billingReady, premium.isPremium, premium.trialEligible, premium.checkoutAvailable, profile, trigger]);

  if (!open) return null;

  const onAction = (target, plan) => {
    clicked.current = true;
    track(EVENTS.PREMIUM_PROMPT_CLICKED, { trigger, target, ...(plan ? { plan } : {}) }, { transport: 'sendBeacon', send_instantly: true });
  };
  const onClose = () => {
    if (!clicked.current) track(EVENTS.PREMIUM_PROMPT_DISMISSED, { trigger });
    setOpen(false);
    doneRef.current();
  };

  return <UpgradeSheetView reason={premiumTrialPromptReason(trigger)} premium={premium} onAction={onAction} onClose={onClose} />;
}
