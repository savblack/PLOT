import test from 'node:test';
import assert from 'node:assert/strict';
import { STREAMING_ALERTS } from '../../copy/streamingAlerts.js';
import { PREMIUM_ALERTS } from '../../copy/premiumAlerts.js';

// The words on the streaming alerts card and in Settings. Nothing here may
// promise push, email or phone notifications: none of it is built.

const strings = (value) => Object.values(value).flatMap(v => typeof v === 'string' ? [v] : typeof v === 'object' && v ? strings(v) : []);

test('nothing on the card or in Settings promises push, email or a phone notification', () => {
  for (const text of strings(STREAMING_ALERTS)) assert.doesNotMatch(text, /\b(push|email|phone|text message|sms)\b/i, text);
});

test('the copy says "in the app" where it describes delivery, and never mentions Premium', () => {
  assert.match(STREAMING_ALERTS.card.hint, /in the app/i);
  assert.match(STREAMING_ALERTS.settings.switchHint, /in the app/i);
  for (const text of strings(STREAMING_ALERTS)) assert.doesNotMatch(text, /premium/i, text);
});

test('without selected services the card still promises the free arrivals, and nothing it cannot deliver', () => {
  assert.match(STREAMING_ALERTS.card.hintNoServices, /free to watch/);
  assert.match(STREAMING_ALERTS.card.hintNoServices, /services/);
});

test('every action has an accessible label and the unmute label names the film', () => {
  assert.ok(STREAMING_ALERTS.card.muteLabel && STREAMING_ALERTS.card.unmuteLabel && STREAMING_ALERTS.card.turnOnAllLabel);
  assert.equal(STREAMING_ALERTS.settings.unmuteLabel('Harbour Lights'), 'Turn streaming alerts back on for Harbour Lights');
});

test('the Premium alerts copy no longer carries a streaming section', () => {
  assert.equal('streaming' in PREMIUM_ALERTS, false);
  assert.equal('films' in PREMIUM_ALERTS.settings, false);
});

test('no em dashes in user-facing copy', () => {
  for (const text of strings(STREAMING_ALERTS)) assert.doesNotMatch(text, /—/, text);
});
