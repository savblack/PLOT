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
import { preparePremiumTrialPromptDecision, clearIneligiblePremiumTrialPromptDeferral } from '@plot/core/premiumTrialPromptDeferral.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { EVENTS, track } from '../lib/analytics.js';
import { usePremium } from '../hooks/usePremium.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { UpgradeSheetView } from './UpgradeSheet.jsx';
import { useApp } from '../hooks/useApp.js';
import { feltValueSuppressionReason } from '@plot/core/hasFeltValue.js';
import { otherOverlayOpen, useOtherOverlayOpen } from '../hooks/useOtherOverlayOpen.js';

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
  const overlayOpen = useOtherOverlayOpen();
  const [open, setOpen] = useState(false);
  const [shownTrigger, setShownTrigger] = useState(trigger);
  const decided = useRef(false);
  const clicked = useRef(false);
  const suppressed = useRef(false);
  const inFlight = useRef(false);
  const needsRecheck = useRef(false);
  const prepared = useRef(null);
  const [revision, setRevision] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (decided.current) return;
    if (inFlight.current) { needsRecheck.current = true; return; }
    // Wait for the first billing read: until then trialEligible means "not known".
    if (premium.billingReady === false) return;
    const key = premiumTrialPromptKey(profile.id);
    const { titleCount, sessionCount } = accountValue;
    const isPremium = isPremiumProfile(profile) || premium.isPremium;
    const decision = premiumTrialPromptDecision({
      seen: readStorage(key) === PREMIUM_TRIAL_PROMPT_SEEN,
      isPremium,
      trialEligible: premium.trialEligible,
      checkoutOpen: premium.checkoutAvailable !== false,
      titleCount, sessionCount, trigger, importRefreshReady: accountValue.importRefreshReady,
      overlayOpen: overlayOpen || otherOverlayOpen(),
    });
    if (decision === 'wait') return;
    if (decision === 'suppress' && suppressed.current) return;
    if (decision === 'discard') {
      void clearIneligiblePremiumTrialPromptDeferral({
        userId: profile.id, isPremium, trialEligible: premium.trialEligible,
        billingKnown: premium.billing != null,
      });
      decided.current = true;
      takePremiumTrialPrompt();
      doneRef.current();
      return;
    }
    const show = (result, counts) => {
      decided.current = true;
      takePremiumTrialPrompt();
      const effectiveTrigger = premiumTrialPromptMoment(trigger, result === 'show_deferred', counts.titleCount);
      setShownTrigger(effectiveTrigger);
      // Seen only after a server claim succeeds, never on suppression or hold.
      writeStorage(key, PREMIUM_TRIAL_PROMPT_SEEN);
      track(EVENTS.PREMIUM_PROMPT_SHOWN, {
        trigger: effectiveTrigger, felt_value: true, title_count: counts.titleCount, session_count: counts.sessionCount,
      });
      setOpen(true);
    };
    if (prepared.current) {
      if (decision === 'show') show(prepared.current.result, prepared.current);
      return;
    }
    inFlight.current = true;
    void preparePremiumTrialPromptDecision({
      userId: profile.id, trigger, decision, wasSuppressed: suppressed.current,
      canShow: () => !otherOverlayOpen(),
    }).then(result => {
      inFlight.current = false;
      if (needsRecheck.current) {
        needsRecheck.current = false;
        setRevision(value => value + 1);
      }
      if (result === 'suppress') {
        suppressed.current = true;
        track(EVENTS.PREMIUM_PROMPT_SUPPRESSED, {
          reason: feltValueSuppressionReason({ titleCount, sessionCount }), title_count: titleCount,
          session_count: sessionCount, trigger,
        });
        setRevision(value => value + 1);
        return;
      }
      if ((result !== 'show' && result !== 'show_deferred') || decided.current) return;
      if (otherOverlayOpen()) {
        // A competing sheet appeared during the server round trip. Keep the
        // successful claim locally until that sheet closes.
        prepared.current = { result, titleCount, sessionCount };
        return;
      }
      show(result, { titleCount, sessionCount });
    });
  }, [premium.billingReady, premium.isPremium, premium.trialEligible, premium.checkoutAvailable, profile, trigger, accountValue, overlayOpen, revision]);

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
