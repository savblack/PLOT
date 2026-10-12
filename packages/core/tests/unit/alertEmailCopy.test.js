import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_EMAIL } from '../../copy/alertEmail.js';
import { STREAMING_ALERTS } from '../../copy/streamingAlerts.js';
import { upgradeSheetContent } from '../../upgradeSheet.js';
import { ALERT_EMAIL_ENABLED } from '../../features.js';

// The words for the Premium email option. It is its own copy object so the Free,
// in-app copy (STREAMING_ALERTS) can keep its pin that it never mentions email.

const strings = (value) => Object.values(value).flatMap(v => typeof v === 'string' ? [v] : typeof v === 'object' && v ? strings(v) : []);

test('the email row says it is Premium and that every email can be unsubscribed from', () => {
  assert.match(ALERT_EMAIL.settings.hint, /Premium/);
  assert.match(ALERT_EMAIL.settings.hint, /unsubscribe/i);
  assert.ok(ALERT_EMAIL.settings.label && ALERT_EMAIL.settings.needsAlerts && ALERT_EMAIL.settings.error);
});

test('nothing in the email copy promises push or a phone notification, and there are no em dashes', () => {
  for (const text of strings(ALERT_EMAIL)) {
    assert.doesNotMatch(text, /\b(push|phone|text message|sms)\b/i, text);
    assert.doesNotMatch(text, /—/, text);
  }
});

test('the Free in-app copy still never mentions email or Premium', () => {
  for (const text of strings(STREAMING_ALERTS)) {
    assert.doesNotMatch(text, /\b(email|premium)\b/i, text);
  }
});

test('the upgrade sheet for email leads with Premium, keeps in-app alerts free, and promises nothing else', () => {
  const sheet = upgradeSheetContent('alertEmail');
  assert.ok(sheet);
  assert.match(sheet.context, /Premium/);
  assert.match(sheet.body, /email/i);
  assert.match(sheet.body, /Alerts in the app stay free/);
  assert.equal(sheet.meter, 0);
  for (const text of [sheet.context, sheet.title, sheet.body]) {
    assert.doesNotMatch(text, /\b(push|phone|sms)\b/i, text);
    assert.doesNotMatch(text, /—/, text);
  }
});

test('the email option is a boolean switch, so it can be hidden until delivery is on', () => {
  assert.equal(typeof ALERT_EMAIL_ENABLED, 'boolean');
});

test('the unsubscribe page has a state for every outcome, says alerts stay in the app, and never gates leaving', () => {
  const U = ALERT_EMAIL.unsubscribe;
  for (const key of ['title', 'body', 'button', 'working', 'doneTitle', 'doneBody', 'invalidTitle', 'invalidBody', 'errorTitle', 'errorBody', 'settings']) {
    assert.ok(U[key], key);
  }
  assert.match(U.body, /alerts in the app/i);
  assert.match(U.doneBody, /Alerts still arrive in the app/);
  // Leaving is never an upsell.
  for (const text of strings(U)) assert.doesNotMatch(text, /premium|upgrade/i, text);
});
