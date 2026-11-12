import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  featureOn,
  fetchKilledSwitches,
  KILL_SWITCHES,
  killedFromFlags,
  newlyKilled,
  parseStoredKilled,
  SWITCH_READER_ID,
} from '../../killSwitches.js';

test('reads enabled kill flags from a /flags v2 answer, ignoring others', () => {
  const body = {
    errorsWhileComputingFlags: false,
    flags: {
      'kill-watch-together': { key: 'kill-watch-together', enabled: true },
      'kill-pricing-page': { key: 'kill-pricing-page', enabled: false },
      'some-experiment': { enabled: true },
    },
  };
  assert.deepEqual(killedFromFlags(body), ['watchTogether']);
});

test('also reads the older featureFlags map', () => {
  assert.deepEqual(killedFromFlags({ featureFlags: { 'kill-apple-login': true, 'kill-google-login': 'yes' } }), ['appleLogin']);
});

test('no usable answer is null, so the caller keeps what it had', () => {
  assert.equal(killedFromFlags(null), null);
  assert.equal(killedFromFlags({}), null);
  assert.equal(killedFromFlags({ errorsWhileComputingFlags: true, flags: { 'kill-watch-together': { enabled: true } } }), null);
  assert.deepEqual(killedFromFlags({ flags: {} }), [], 'an answer with nothing on is a real answer');
});

test('fetch posts the fixed reader id, never a visitor id, and fails open', async () => {
  let sent;
  const http = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ flags: { 'kill-pricing-page': { enabled: true } } }));
  };
  assert.deepEqual(await fetchKilledSwitches({ http, host: 'https://a.example/', token: 'phc_x' }), ['pricingPage']);
  assert.equal(sent.url, 'https://a.example/flags/?v=2');
  assert.deepEqual(sent.body, { api_key: 'phc_x', distinct_id: SWITCH_READER_ID });

  assert.equal(await fetchKilledSwitches({ http: async () => { throw new Error('blocked'); }, host: 'h', token: 't' }), null);
  assert.equal(await fetchKilledSwitches({ http: async () => new Response('nope', { status: 500 }), host: 'h', token: 't' }), null);
  assert.equal(await fetchKilledSwitches({ http, host: '', token: 't' }), null);
});

test('stored lists drop unknown names and survive junk', () => {
  assert.deepEqual(parseStoredKilled('["watchTogether","gone"]'), ['watchTogether']);
  assert.deepEqual(parseStoredKilled('not json'), []);
  assert.deepEqual(parseStoredKilled(null), []);
});

test('a switch only ever turns a feature off', () => {
  assert.equal(featureOn('watchTogether', true, []), true);
  assert.equal(featureOn('watchTogether', true, ['watchTogether']), false);
  assert.equal(featureOn('googleLogin', false, []), false, 'never turns on what the build left off');
});

test('only a newly killed feature that is launched forces a reload', () => {
  const defaults = { watchTogether: true, pricingPage: true, appleLogin: true, googleLogin: false };
  assert.deepEqual(newlyKilled([], ['watchTogether'], defaults), ['watchTogether']);
  assert.deepEqual(newlyKilled(['watchTogether'], ['watchTogether'], defaults), []);
  assert.deepEqual(newlyKilled([], ['googleLogin'], defaults), [], 'already hidden');
  assert.deepEqual(newlyKilled(['pricingPage'], [], defaults), [], 'lifting waits for the next load');
});

test('every switch has a kill- flag key', () => {
  for (const flag of Object.values(KILL_SWITCHES)) assert.match(flag, /^kill-[a-z-]+$/);
});
