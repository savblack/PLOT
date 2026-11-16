// The one-time "Try Premium free for 7 days" prompt (board card #1). Mounted
// in the app shell; it does nothing until onboarding finishes or a Trakt
// import saves titles (requestPremiumTrialPrompt in @plot/core), or a deferred
// offer reaches the fifth title or second session. Then, once billing and
// value have answered, it opens the existing upgrade sheet for a Free member
// who can still have the trial, and never again on this device for that
// account. The sheet's own button goes to the existing Checkout with the
// trial. Mobile's counterpart is apps/mobile/components/PremiumTrialPrompt.tsx.
import { useEffect, useRef, useState } from 'react';
import {
  PREMIUM_TRIAL_PROMPT_SEEN, onPremiumTrialPromptRequest, peekPremiumTrialPrompt, premiumTrialPromptKey,
  premiumTrialPromptReason, shouldHoldPremiumTrialPrompt, takePremiumTrialPrompt,
  premiumTrialPromptDecision, premiumTrialPromptMoment,
} from '@plot/core/premiumTrialPrompt.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { EVENTS, track } from '../lib/analytics.js';
import { usePremium } from '../hooks/usePremium.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { UpgradeSheetView } from './UpgradeSheet.jsx';
import { useApp } from '../hooks/useApp.js';
import { feltValueSuppressionReason } from '@plot/core/hasFeltValue.js';

/** @param {{ profile: { id: string, is_premium?: boolean } | null | undefined, currentView?: string | null }} props */
export default function PremiumTrialPrompt({ profile, currentView }) {
  const { accountValue } = useApp();
  const [trigger, setTrigger] = useState(() => peekPremiumTrialPrompt());
  useEffect(() => onPremiumTrialPromptRequest(setTrigger), []);
  // The billing reads only start once there is a moment to decide on, so the
  // shell does not ask for billing status on every page load.
  if (!trigger || !profile?.id || shouldHoldPremiumTrialPrompt(trigger, currentView)) return null;
  return <TrialPromptGate key={trigger} profile={profile} trigger={trigger} accountValue={accountValue} onDone={() => setTrigger(null)} />;
}

/**
 * @param {{ profile: { id: string, is_premium?: boolean }, trigger: import('@plot/core/premiumTrialPrompt.js').PremiumTrialPromptTrigger, onDone: () => void }} props
 */
export function TrialPromptGate({ profile, trigger, accountValue, onDone }) {
  const premium = usePremium(profile);
  const [open, setOpen] = useState(false);
  const [shownTrigger, setShownTrigger] = useState(trigger);
  const decided = useRef(false);
  const clicked = useRef(false);
  const suppressed = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (decided.current) return;
    // Wait for the first billing read: until then trialEligible means "not known".
    if (premium.billingReady === false) return;
    const key = premiumTrialPromptKey(profile.id);
    const { titleCount, sessionCount } = accountValue;
    const decision = premiumTrialPromptDecision({
      seen: readStorage(key) === PREMIUM_TRIAL_PROMPT_SEEN,
      isPremium: isPremiumProfile(profile) || premium.isPremium,
      trialEligible: premium.trialEligible,
      checkoutOpen: premium.checkoutAvailable !== false,
      titleCount, sessionCount,
    });
    if (decision === 'wait') return;
    if (decision !== 'show') {
      if (decision === 'suppress') {
        if (!suppressed.current) {
          suppressed.current = true;
          track(EVENTS.PREMIUM_PROMPT_SUPPRESSED, {
            reason: feltValueSuppressionReason(trigger), title_count: titleCount,
            session_count: sessionCount, trigger,
          });
        }
        return;
      }
      decided.current = true;
      takePremiumTrialPrompt();
      doneRef.current();
      return;
    }
    decided.current = true;
    takePremiumTrialPrompt();
    const effectiveTrigger = premiumTrialPromptMoment(trigger, suppressed.current, titleCount);
    setShownTrigger(effectiveTrigger);
    // Seen as soon as it shows, so a reload mid-prompt never shows it twice.
    writeStorage(key, PREMIUM_TRIAL_PROMPT_SEEN);
    track(EVENTS.PREMIUM_PROMPT_SHOWN, {
      trigger: effectiveTrigger, felt_value: true, title_count: titleCount, session_count: sessionCount,
    });
    setOpen(true);
  }, [premium.billingReady, premium.isPremium, premium.trialEligible, premium.checkoutAvailable, profile, trigger, accountValue]);

  if (!open) return null;

  const onAction = (target, plan) => {
    clicked.current = true;
    track(EVENTS.PREMIUM_PROMPT_CLICKED, { trigger: shownTrigger, target, ...(plan ? { plan } : {}) }, { transport: 'sendBeacon', send_instantly: true });
  };
  const onClose = () => {
    if (!clicked.current) track(EVENTS.PREMIUM_PROMPT_DISMISSED, { trigger: shownTrigger });
    setOpen(false);
    doneRef.current();
  };

  return <UpgradeSheetView reason={premiumTrialPromptReason(shownTrigger)} premium={premium} onAction={onAction} onClose={onClose} />;
}
