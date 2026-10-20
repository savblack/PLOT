import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MANAGE_URL, TRIAL_REMINDER_FROM, TRIAL_REMINDER_REPLY_TO, TRIAL_REMINDER_TEXT,
  buildTrialReminderEmail, planAmount, planFromPrice, trialEndLabel,
} from '../../../../supabase/functions/_shared/trialReminderEmail.js';
import { REGISTERED_ADDRESS } from '../../../../supabase/functions/_shared/alertEmail.js';

// 2026-10-21T23:10:00Z: late on the 21st in UTC, already the 22nd in Sydney.
const TRIAL_END = Math.floor(Date.parse('2026-10-21T23:10:00Z') / 1000);

test('the trial end is spelled out as a UTC day, never a guessed local one', () => {
  assert.equal(trialEndLabel(TRIAL_END), 'Wednesday 21 October 2026 (UTC)');
  assert.throws(() => trialEndLabel(0));
  assert.throws(() => trialEndLabel(1.5));
});

test('only the two Premium prices are described, in plain words', () => {
  assert.equal(planFromPrice({ currency: 'usd', unit_amount: 300, recurring: { interval: 'month' } }), 'monthly');
  assert.equal(planFromPrice({ currency: 'usd', unit_amount: 2400, recurring: { interval: 'year' } }), 'yearly');
  assert.equal(planFromPrice({ currency: 'usd', unit_amount: 2500, recurring: { interval: 'year' } }), null);
  assert.equal(planFromPrice({ currency: 'aud', unit_amount: 300, recurring: { interval: 'month' } }), null);
  assert.equal(planFromPrice(null), null);
  assert.equal(planAmount('monthly'), 'US$3 a month');
  assert.equal(planAmount('yearly'), 'US$24 a year');
  assert.throws(() => planAmount('weekly'));
});

test('the email says when the trial ends, what is charged, and how to cancel', () => {
  const { subject, html, text } = buildTrialReminderEmail({ trialEnd: TRIAL_END, plan: 'monthly' });
  assert.equal(subject, 'Your plot Premium trial ends on Wednesday 21 October 2026 (UTC)');
  for (const body of [html, text]) {
    assert.match(body, /ends on Wednesday 21 October 2026 \(UTC\)/);
    assert.match(body, /charged US\$3 a month, taxes included/);
    assert.match(body, /renew automatically until you cancel/);
    assert.match(body, /Manage subscription/);
    assert.match(body, /you will not be charged/);
    assert.match(body, /support@theplot\.tv/);
    assert.ok(body.includes(REGISTERED_ADDRESS));
    assert.doesNotMatch(body, /nsubscribe/, 'a billing notice has no unsubscribe link');
  }
  assert.match(html, new RegExp(`href="${DEFAULT_MANAGE_URL}"`));
  assert.match(text, new RegExp(`${TRIAL_REMINDER_TEXT.button}: ${DEFAULT_MANAGE_URL}`));
});

test('yearly says the yearly amount', () => {
  const { text } = buildTrialReminderEmail({ trialEnd: TRIAL_END, plan: 'yearly' });
  assert.match(text, /US\$24 a year/);
});

test('the manage link is checked and never interpolated raw', () => {
  assert.throws(() => buildTrialReminderEmail({ trialEnd: TRIAL_END, plan: 'monthly', manageUrl: 'javascript:alert(1)' }));
  assert.throws(() => buildTrialReminderEmail({ trialEnd: TRIAL_END, plan: 'monthly', manageUrl: 'not a url' }));
  const { html } = buildTrialReminderEmail({ trialEnd: TRIAL_END, plan: 'monthly', manageUrl: 'https://staging.example/settings?a=1&b=2' });
  assert.match(html, /href="https:\/\/staging\.example\/settings\?a=1&amp;b=2"/);
});

test('sender identity is the verified domain with support as reply-to', () => {
  assert.match(TRIAL_REMINDER_FROM, /@theplot\.tv>$/);
  assert.equal(TRIAL_REMINDER_REPLY_TO, 'support@theplot.tv');
});
