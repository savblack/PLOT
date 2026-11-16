/**
 * The one-time "Try Premium free for 7 days" prompt on the phone (board card
 * #1). Home mounts it; it does nothing until onboarding finishes or a Trakt
 * import saves titles (requestPremiumTrialPrompt in @plot/core), or a deferred
 * offer reaches the fifth title or second session. It waits while any native
 * sheet or panel holds the screen. Then, once billing and value have answered, it
 * opens the existing upgrade sheet for a Free member who can still have the
 * trial and whose storefront allows the browser checkout, once per account on
 * this phone. Web's counterpart is apps/web/src/components/PremiumTrialPrompt.jsx.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  PREMIUM_TRIAL_PROMPT_SEEN, onPremiumTrialPromptRequest, peekPremiumTrialPrompt, premiumTrialPromptHeld,
  premiumTrialPromptKey, premiumTrialPromptReason, takePremiumTrialPrompt,
  premiumTrialPromptDecision, premiumTrialPromptMoment,
  type PremiumTrialPromptTrigger,
} from '@plot/core/premiumTrialPrompt.js';
import { preparePremiumTrialPromptDecision, clearIneligiblePremiumTrialPromptDeferral } from '@plot/core/premiumTrialPromptDeferral.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { trialEligible } from '@plot/core/billing.js';
import { useBillingStatusResult } from '@plot/core/useBillingStatus.js';
import { track, EVENTS } from '../lib/analytics';
import { readStorage, writeStorage } from '../lib/storage';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';
import { usePremiumCheckout } from '../lib/usePremiumCheckout';
import UpgradeSheet from './UpgradeSheet';
import { useAppData } from '../contexts/AppDataContext';
import { feltValueSuppressionReason } from '@plot/core/hasFeltValue.js';

type Profile = { id?: string | null; is_premium?: boolean | null } | null | undefined;

export default function PremiumTrialPrompt({ userId, profile }: { userId: string | null | undefined; profile: Profile }) {
  const { accountValue } = useAppData();
  const [trigger, setTrigger] = useState<PremiumTrialPromptTrigger | null>(() => peekPremiumTrialPrompt());
  const [held, setHeld] = useState(() => premiumTrialPromptHeld());
  useEffect(() => onPremiumTrialPromptRequest((next) => {
    setTrigger(next);
    setHeld(premiumTrialPromptHeld());
  }), []);
  // The billing and storefront reads only start once there is a moment to decide on.
  if (!trigger || !userId) return null;
  return <TrialPromptGate key={trigger} userId={userId} profile={profile} trigger={trigger} accountValue={accountValue} held={held} onDone={() => setTrigger(null)} />;
}

function TrialPromptGate({ userId, profile, trigger, accountValue, held, onDone }: {
  userId: string; profile: Profile; trigger: PremiumTrialPromptTrigger;
  accountValue: { titleCount: number | null; sessionCount: number | null; feltValue: boolean; importRefreshReady: boolean };
  held: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const { data: billing, ready } = useBillingStatusResult(userId);
  const checkout = usePremiumCheckout(true);
  const [open, setOpen] = useState(false);
  const [shownTrigger, setShownTrigger] = useState<PremiumTrialPromptTrigger>(trigger);
  const decided = useRef(false);
  const clicked = useRef(false);
  const suppressed = useRef(false);
  const inFlight = useRef(false);
  const needsRecheck = useRef(false);
  const prepared = useRef<{ result: 'show' | 'show_deferred'; titleCount: number | null; sessionCount: number | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (decided.current || !ready || held) return;
    if (inFlight.current) { needsRecheck.current = true; return; }
    // No Upgrade button outside storefronts that allow the browser checkout,
    // so no prompt there either. Wait for the storefront read before deciding.
    if (!checkout.allowed && !checkout.storefrontKnown) return;
    const { titleCount, sessionCount } = accountValue;
    const key = premiumTrialPromptKey(userId);
    inFlight.current = true;
    void (async () => {
      const seen = (await readStorage(key)) === PREMIUM_TRIAL_PROMPT_SEEN;
      if (decided.current) return;
      const isPremium = isPremiumProfile(profile) || billing?.isPremium === true;
      const canTrial = trialEligible(billing);
      const decision = premiumTrialPromptDecision({
        seen,
        isPremium,
        trialEligible: canTrial,
        checkoutOpen: checkout.allowed && !checkout.closed,
        titleCount, sessionCount, trigger, importRefreshReady: accountValue.importRefreshReady,
        overlayOpen: premiumTrialPromptHeld(),
      });
      if (decision === 'wait') return;
      if (decision === 'suppress' && suppressed.current) return;
      if (decision === 'discard') {
        void clearIneligiblePremiumTrialPromptDeferral({
          userId, isPremium, trialEligible: canTrial, billingKnown: billing != null,
        });
        decided.current = true;
        takePremiumTrialPrompt();
        doneRef.current();
        return;
      }
      const show = async (result: 'show' | 'show_deferred', counts: { titleCount: number | null; sessionCount: number | null }) => {
        decided.current = true;
        takePremiumTrialPrompt();
        const effectiveTrigger = premiumTrialPromptMoment(trigger, result === 'show_deferred', counts.titleCount);
        setShownTrigger(effectiveTrigger);
        await writeStorage(key, PREMIUM_TRIAL_PROMPT_SEEN);
        track(EVENTS.PREMIUM_PROMPT_SHOWN, {
          trigger: effectiveTrigger, felt_value: true, title_count: counts.titleCount, session_count: counts.sessionCount,
        });
        setOpen(true);
      };
      if (prepared.current) {
        if (decision === 'show') await show(prepared.current.result, prepared.current);
        return;
      }
      const result = await preparePremiumTrialPromptDecision({
        userId, trigger, decision, wasSuppressed: suppressed.current,
        canShow: () => !premiumTrialPromptHeld(),
      });
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
      if (premiumTrialPromptHeld()) {
        prepared.current = { result, titleCount, sessionCount };
        return;
      }
      await show(result, { titleCount, sessionCount });
    })().finally(() => {
      inFlight.current = false;
      if (needsRecheck.current) {
        needsRecheck.current = false;
        setRevision(value => value + 1);
      }
    });
  }, [ready, billing, checkout.allowed, checkout.storefrontKnown, checkout.closed, profile, userId, trigger, accountValue, held, revision]);

  const reason = premiumTrialPromptReason(shownTrigger);
  if (!open || !reason) return null;

  const onAction = (target: 'checkout' | 'plans', plan?: string) => {
    clicked.current = true;
    track(EVENTS.PREMIUM_PROMPT_CLICKED, { trigger: shownTrigger, target, ...(plan ? { plan } : {}) });
  };
  const onClose = () => {
    if (!clicked.current) track(EVENTS.PREMIUM_PROMPT_DISMISSED, { trigger: shownTrigger });
    setOpen(false);
    doneRef.current();
  };

  return (
    <UpgradeSheet
      visible
      holdTrialPrompt={false}
      reason={reason}
      onAction={onAction}
      onClose={onClose}
      onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)}
    />
  );
}
