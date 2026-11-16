import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PREMIUM_TRIAL_PROMPT_TRIGGERS, clearPremiumTrialPrompt, holdPremiumTrialPrompt, onPremiumTrialPromptRequest,
  peekPremiumTrialPrompt, premiumTrialPromptHeld, premiumTrialPromptKey, premiumTrialPromptReason,
  premiumTrialPromptTriggerForImport, requestPremiumTrialPrompt, shouldHoldPremiumTrialPrompt,
  shouldShowPremiumTrialPrompt, premiumTrialPromptDecision, premiumTrialPromptMoment, takePremiumTrialPrompt,
} from '../../premiumTrialPrompt.js';
import {
  preparePremiumTrialPromptDecision, readPremiumTrialPromptDeferral, requestDeferredPremiumTrialPrompt,
  clearIneligiblePremiumTrialPromptDeferral,
} from '../../premiumTrialPromptDeferral.js';
import { upgradeSheetContent, upgradeSheetGateFeature } from '../../upgradeSheet.js';
import { EVENTS } from '../../analyticsEvents.js';

const eligible = { seen: false, isPremium: false, trialEligible: true, checkoutOpen: true, titleCount: 5, sessionCount: 1 };

function deferredProfile() {
  let marker = null;
  const calls = [];
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { premium_trial_prompt_deferred_at: marker }, error: null,
    }) }) }) }),
    rpc: async (name, { p_user_id, p_deferred }) => {
      calls.push([name, p_user_id, p_deferred]);
      if (p_deferred) {
        marker ??= '2026-11-16T00:00:00Z';
        return { data: true, error: null };
      }
      if (!marker) return { data: false, error: null };
      marker = null;
      return { data: true, error: null };
    },
  };
  return { client, calls, get marker() { return marker; } };
}

test('no deferred offer means neither fifth title nor second session requests a prompt', async () => {
  clearPremiumTrialPrompt();
  const profile = deferredProfile();
  const readSeen = async () => false;
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 5, sessionCount: 1, readSeen, client: profile.client }), null);
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 4, sessionCount: 2, readSeen, client: profile.client }), null);
  assert.equal(peekPremiumTrialPrompt(), null);
  assert.deepEqual(profile.calls, []);
});

test('a suppressed offer persists without a seen write, then requests and claims exactly once at fifth title', async () => {
  clearPremiumTrialPrompt();
  const profile = deferredProfile();
  const seenWrites = [];
  const requests = [];
  const off = onPremiumTrialPromptRequest(trigger => requests.push(trigger));
  const readSeen = async () => seenWrites.length > 0;
  const decision = premiumTrialPromptDecision({ ...eligible, titleCount: 4 });
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'onboarding', decision, wasSuppressed: false, client: profile.client }), 'suppress');
  assert.ok(profile.marker);
  assert.deepEqual(seenWrites, []);
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 4, sessionCount: 1, readSeen, client: profile.client }), null);
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 5, sessionCount: 1, readSeen, client: profile.client }), 'fifth_title');
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 5, sessionCount: 1, readSeen, client: profile.client }), null);
  assert.equal(peekPremiumTrialPrompt(), 'fifth_title');
  assert.deepEqual(requests, ['fifth_title']);
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'fifth_title', decision: 'show', wasSuppressed: false, client: profile.client }), 'show_deferred');
  assert.equal(profile.marker, null);
  seenWrites.push('shown');
  takePremiumTrialPrompt();
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 5, sessionCount: 2, readSeen, client: profile.client }), null);
  assert.deepEqual(profile.calls, [
    ['set_premium_trial_prompt_deferral', 'u1', true],
    ['set_premium_trial_prompt_deferral', 'u1', false],
  ]);
  clearPremiumTrialPrompt();
  off();
});

test('a deferred offer requests once at second session and only one device can claim it', async () => {
  clearPremiumTrialPrompt();
  const profile = deferredProfile();
  const requests = [];
  const off = onPremiumTrialPromptRequest(trigger => requests.push(trigger));
  const readSeen = async () => false;
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'trakt_import', decision: 'suppress', wasSuppressed: false, client: profile.client }), 'suppress');
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 4, sessionCount: 2, readSeen: async () => true, client: profile.client }), null);
  assert.equal(peekPremiumTrialPrompt(), null);
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 4, sessionCount: 2, readSeen, client: profile.client }), 'second_session');
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 4, sessionCount: 3, readSeen, client: profile.client }), null);
  assert.deepEqual(requests, ['second_session']);
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'second_session', decision: 'show', wasSuppressed: false, client: profile.client }), 'show_deferred');
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'second_session', decision: 'show', wasSuppressed: false, client: profile.client }), 'wait');
  assert.equal(profile.marker, null);
  clearPremiumTrialPrompt();
  off();
});

test('unknown marker or unavailable RPC fails closed, including an in-memory suppression', async () => {
  clearPremiumTrialPrompt();
  const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42703' } }) }) }) }), rpc: async () => ({ data: null, error: { code: '42883' } }) };
  assert.equal(await readPremiumTrialPromptDeferral('u1', { client: broken }), null);
  assert.equal(await requestDeferredPremiumTrialPrompt({ userId: 'u1', titleCount: 5, sessionCount: 2, readSeen: async () => false, client: broken }), null);
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'onboarding', decision: 'suppress', wasSuppressed: false, client: broken }), 'wait');
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'onboarding', decision: 'show', wasSuppressed: true, client: broken }), 'wait');
  assert.equal(peekPremiumTrialPrompt(), null);
});

test('only a confirmed permanent ineligibility clears a deferred marker', async () => {
  const profile = deferredProfile();
  await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'onboarding', decision: 'suppress', wasSuppressed: false, client: profile.client });
  assert.equal(await clearIneligiblePremiumTrialPromptDeferral({ userId: 'u1', isPremium: false, trialEligible: false, billingKnown: false, client: profile.client }), false);
  assert.ok(profile.marker);
  assert.equal(await clearIneligiblePremiumTrialPromptDeferral({ userId: 'u1', isPremium: false, trialEligible: false, billingKnown: true, client: profile.client }), true);
  assert.equal(profile.marker, null);
});

test('shows only to an unseen Free member who can still have the trial while checkout is open', () => {
  assert.equal(shouldShowPremiumTrialPrompt(eligible), true);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, seen: true }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, isPremium: true }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, trialEligible: false }), false);
  // Billing still loading is not yes.
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, trialEligible: null }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, trialEligible: undefined }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, checkoutOpen: false }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, titleCount: 4, sessionCount: 1 }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, titleCount: 0, sessionCount: 2 }), true);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, titleCount: null, sessionCount: null }), false);
});

test('suppressed trial request remains pending without a seen write', () => {
  clearPremiumTrialPrompt();
  requestPremiumTrialPrompt('onboarding');
  const writes = [];
  const decision = premiumTrialPromptDecision({ ...eligible, titleCount: 4, sessionCount: 1 });
  if (decision === 'show') { writes.push('shown'); takePremiumTrialPrompt(); }
  assert.equal(decision, 'suppress');
  assert.deepEqual(writes, []);
  assert.equal(peekPremiumTrialPrompt(), 'onboarding');
  assert.equal(premiumTrialPromptDecision({ ...eligible, titleCount: 5, sessionCount: 1 }), 'show');
  assert.equal(premiumTrialPromptDecision({ ...eligible, titleCount: 4, sessionCount: null }), 'wait');
  assert.equal(premiumTrialPromptMoment('trakt_import', false, 5), 'trakt_import');
  assert.equal(premiumTrialPromptMoment('onboarding', true, 5), 'fifth_title');
  assert.equal(premiumTrialPromptMoment('onboarding', true, 2), 'second_session');
  clearPremiumTrialPrompt();
});

test('Trakt waits for refreshed counts before deciding, and deferral selects value copy', async () => {
  const profile = deferredProfile();
  const stale = premiumTrialPromptDecision({ ...eligible, trigger: 'trakt_import', importRefreshReady: false, titleCount: 0, sessionCount: 2 });
  assert.equal(stale, 'wait');
  assert.equal(premiumTrialPromptDecision({ ...eligible, trigger: 'trakt_import', importRefreshReady: true, titleCount: null, sessionCount: 2 }), 'wait');
  assert.equal(profile.marker, null);
  const refreshed = premiumTrialPromptDecision({ ...eligible, trigger: 'trakt_import', importRefreshReady: true, titleCount: 5 });
  assert.equal(refreshed, 'show');
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'trakt_import', decision: refreshed, wasSuppressed: false, client: profile.client }), 'show');
  assert.equal(premiumTrialPromptReason('trakt_import'), 'trialAfterTraktImport');
  assert.deepEqual(profile.calls, []);
  assert.equal(premiumTrialPromptDecision({ ...eligible, trigger: 'trakt_import', importRefreshReady: true, titleCount: 5, seen: true }), 'discard');

  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'onboarding', decision: 'suppress', wasSuppressed: false, client: profile.client }), 'suppress');
  assert.equal(await preparePremiumTrialPromptDecision({ userId: 'u1', trigger: 'trakt_import', decision: refreshed, wasSuppressed: false, client: profile.client }), 'show_deferred');
  assert.equal(premiumTrialPromptReason(premiumTrialPromptMoment('trakt_import', true, 5)), 'trialAfterValue');
  assert.equal(profile.marker, null);
});

test('only a Trakt import that saved titles is a trigger', () => {
  assert.equal(premiumTrialPromptTriggerForImport({ source: 'trakt', count: 12 }), 'trakt_import');
  assert.equal(premiumTrialPromptTriggerForImport({ source: 'trakt', count: 0 }), null);
  assert.equal(premiumTrialPromptTriggerForImport({ source: 'trakt' }), null);
  assert.equal(premiumTrialPromptTriggerForImport({ source: 'letterboxd', count: 40 }), null);
  assert.equal(premiumTrialPromptTriggerForImport({ source: 'trakt-export', count: 40 }), null);
  assert.equal(premiumTrialPromptTriggerForImport(), null);
});

test('the key is per account and each trigger has its own sheet copy, with no gate hit', () => {
  assert.equal(premiumTrialPromptKey('u1'), 'plot.premiumTrialPrompt.u1');
  assert.equal(premiumTrialPromptReason('onboarding'), 'trialAfterOnboarding');
  assert.equal(premiumTrialPromptReason('trakt_import'), 'trialAfterTraktImport');
  assert.equal(premiumTrialPromptReason('fifth_title'), 'trialAfterValue');
  assert.equal(premiumTrialPromptReason('second_session'), 'trialAfterValue');
  assert.equal(upgradeSheetContent('trialAfterValue').title, 'Want more from Plot? Try Premium free for 7 days.');
  assert.deepEqual([...PREMIUM_TRIAL_PROMPT_TRIGGERS], ['onboarding', 'trakt_import', 'fifth_title', 'second_session']);
  for (const trigger of PREMIUM_TRIAL_PROMPT_TRIGGERS) {
    const reason = premiumTrialPromptReason(trigger);
    const content = upgradeSheetContent(reason);
    assert.ok(content, trigger);
    assert.equal(content.meter, 0);
    assert.equal(content.also.length, 2);
    assert.match(content.body, /7 days/);
    assert.doesNotMatch(`${content.context} ${content.title} ${content.body}`, /—/);
    // Offering the trial is not hitting a paywall: premium_gate_hit stays clean.
    assert.equal(upgradeSheetGateFeature(reason), null);
  }
  assert.equal(premiumTrialPromptReason('nope'), null);
});

test('one trigger waits at a time, the latest wins, and taking it clears it', () => {
  clearPremiumTrialPrompt();
  const heard = [];
  const off = onPremiumTrialPromptRequest(t => heard.push(t));
  requestPremiumTrialPrompt('onboarding');
  requestPremiumTrialPrompt('trakt_import');
  requestPremiumTrialPrompt('nope');
  assert.equal(peekPremiumTrialPrompt(), 'trakt_import');
  assert.deepEqual(heard, ['onboarding', 'trakt_import']);
  assert.equal(takePremiumTrialPrompt(), 'trakt_import');
  assert.equal(peekPremiumTrialPrompt(), null);
  off();
  requestPremiumTrialPrompt('onboarding');
  assert.deepEqual(heard, ['onboarding', 'trakt_import']);
  clearPremiumTrialPrompt();
  assert.equal(peekPremiumTrialPrompt(), null);
});

test('holds stack, release once each, and tell listeners when they lift', () => {
  clearPremiumTrialPrompt();
  const heard = [];
  const off = onPremiumTrialPromptRequest(t => heard.push(t));
  const a = holdPremiumTrialPrompt();
  const b = holdPremiumTrialPrompt();
  assert.equal(premiumTrialPromptHeld(), true);
  a(); a();
  assert.equal(premiumTrialPromptHeld(), true);
  b();
  assert.equal(premiumTrialPromptHeld(), false);
  assert.equal(heard.length, 2);
  off();
});

test('the onboarding prompt waits while the import page is open; an import prompt does not', () => {
  assert.equal(shouldHoldPremiumTrialPrompt('onboarding', 'import'), true);
  assert.equal(shouldHoldPremiumTrialPrompt('onboarding', 'home'), false);
  assert.equal(shouldHoldPremiumTrialPrompt('trakt_import', 'import'), false);
  assert.equal(shouldHoldPremiumTrialPrompt(null, 'import'), false);
});

test('the three prompt events exist', () => {
  assert.equal(EVENTS.PREMIUM_PROMPT_SHOWN, 'premium_prompt_shown');
  assert.equal(EVENTS.PREMIUM_PROMPT_CLICKED, 'premium_prompt_clicked');
  assert.equal(EVENTS.PREMIUM_PROMPT_DISMISSED, 'premium_prompt_dismissed');
  assert.equal(EVENTS.PREMIUM_PROMPT_SUPPRESSED, 'premium_prompt_suppressed');
});
