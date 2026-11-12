import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PREMIUM_TRIAL_PROMPT_TRIGGERS, clearPremiumTrialPrompt, holdPremiumTrialPrompt, onPremiumTrialPromptRequest,
  peekPremiumTrialPrompt, premiumTrialPromptHeld, premiumTrialPromptKey, premiumTrialPromptReason,
  premiumTrialPromptTriggerForImport, requestPremiumTrialPrompt, shouldHoldPremiumTrialPrompt,
  shouldShowPremiumTrialPrompt, takePremiumTrialPrompt,
} from '../../premiumTrialPrompt.js';
import { upgradeSheetContent, upgradeSheetGateFeature } from '../../upgradeSheet.js';
import { EVENTS } from '../../analyticsEvents.js';

const eligible = { seen: false, isPremium: false, trialEligible: true, checkoutOpen: true };

test('shows only to an unseen Free member who can still have the trial while checkout is open', () => {
  assert.equal(shouldShowPremiumTrialPrompt(eligible), true);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, seen: true }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, isPremium: true }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, trialEligible: false }), false);
  // Billing still loading is not yes.
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, trialEligible: null }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, trialEligible: undefined }), false);
  assert.equal(shouldShowPremiumTrialPrompt({ ...eligible, checkoutOpen: false }), false);
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
  assert.deepEqual([...PREMIUM_TRIAL_PROMPT_TRIGGERS], ['onboarding', 'trakt_import']);
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
});
