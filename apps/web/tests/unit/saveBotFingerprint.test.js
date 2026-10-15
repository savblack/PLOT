import assert from 'node:assert/strict';
import test from 'node:test';
import { isSaveBotFingerprint } from '../../src/utils/saveBotFingerprint.js';

const incident = {
  hostname: 'app.theplot.tv',
  pathname: '/save',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  referrer: '',
  screenWidth: 1920,
  screenHeight: 1080,
};

test('excludes the exact direct /save browser fingerprint', () => {
  assert.equal(isSaveBotFingerprint(incident), true);
});

test('keeps nearby traffic when any incident condition changes', () => {
  const changes = {
    hostname: 'theplot.tv',
    pathname: '/signup',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    referrer: 'https://theplot.tv/',
    screenWidth: 1440,
    screenHeight: 900,
  };
  for (const [key, value] of Object.entries(changes)) {
    assert.equal(isSaveBotFingerprint({ ...incident, [key]: value }), false, key);
  }
  assert.equal(isSaveBotFingerprint({ ...incident, userAgent: incident.userAgent.replace('Linux', 'Windows NT 10.0') }), false);
  assert.equal(isSaveBotFingerprint({ ...incident, userAgent: `${incident.userAgent} Extra` }), false);
});

test('missing browser evidence never excludes analytics', () => {
  assert.equal(isSaveBotFingerprint(), false);
  for (const key of Object.keys(incident)) {
    const partial = { ...incident };
    delete partial[key];
    assert.equal(isSaveBotFingerprint(partial), false, key);
  }
});
