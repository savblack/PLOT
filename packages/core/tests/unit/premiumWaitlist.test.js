import assert from 'node:assert/strict';
import test from 'node:test';

import { PREMIUM_WAITLIST } from '../../copy/premiumWaitlist.js';
import {
  isWaitlistEmail,
  normaliseWaitlistEmail,
  premiumWaitlistCopy,
  premiumWaitlistGate,
  premiumWaitlistRequestBody,
  premiumWaitlistStorageKey,
  waitlistJoinOutcome,
} from '../../premiumWaitlist.js';

test('only the themes and smart lists sheets join the waitlist', () => {
  assert.equal(premiumWaitlistGate('themes'), 'themes');
  assert.equal(premiumWaitlistGate('smartLists'), 'smart_lists');
  assert.equal(premiumWaitlistGate('lists'), null);
  assert.equal(premiumWaitlistGate('alertEmail'), null);
  assert.equal(premiumWaitlistGate(''), null);
});

test('the sheet uses the feature name in the headline, including the plural', () => {
  assert.equal(premiumWaitlistCopy('themes')?.headline, 'Custom themes is part of Plot Premium');
  assert.equal(premiumWaitlistCopy('smart_lists')?.headline, 'Smart lists is part of Plot Premium');
  assert.equal(premiumWaitlistCopy('themes')?.notify, 'Notify me');
  assert.equal(premiumWaitlistCopy('themes')?.body, PREMIUM_WAITLIST.body);
  assert.equal(premiumWaitlistCopy('themes')?.success, PREMIUM_WAITLIST.success);
  assert.equal(premiumWaitlistCopy('nope'), null);
});

test('waitlist copy has no em dash', () => {
  const copy = premiumWaitlistCopy('themes');
  const text = `${copy.headline} ${copy.body} ${copy.success} ${copy.emailInvalid}`;
  assert.equal(text.includes('—'), false);
  assert.match(copy.body, /Premium isn’t open yet/);
  assert.match(copy.success, /You’re on the list/);
});

test('email validation matches the edge function rule', () => {
  assert.equal(normaliseWaitlistEmail('  Reader@Example.com '), 'reader@example.com');
  assert.equal(isWaitlistEmail('reader@example.com'), true);
  assert.equal(isWaitlistEmail('not-an-email'), false);
  assert.equal(isWaitlistEmail('a@b.c'), false);
  assert.equal(isWaitlistEmail(''), false);
  assert.equal(isWaitlistEmail(`${'a'.repeat(250)}@b.co`), false);
});

test('a signed-in join does not send the typed address', () => {
  assert.deepEqual(
    premiumWaitlistRequestBody({ gate: 'themes', email: 'other@example.com', signedIn: true }),
    { gate: 'themes' },
  );
  assert.deepEqual(
    premiumWaitlistRequestBody({ gate: 'smart_lists', email: ' Reader@Example.com ', website: '' }),
    { gate: 'smart_lists', email: 'reader@example.com' },
  );
  assert.deepEqual(
    premiumWaitlistRequestBody({ gate: 'themes', email: 'reader@example.com', website: 'http://spam.test' }),
    { gate: 'themes', email: 'reader@example.com', website: 'http://spam.test' },
  );
});

test('an existing join shows success and does not count again', () => {
  assert.deepEqual(waitlistJoinOutcome({ ok: true, already: false }), { joined: true, track: true, error: null });
  assert.deepEqual(waitlistJoinOutcome({ ok: true, already: true }), { joined: true, track: false, error: null });
  assert.deepEqual(waitlistJoinOutcome({ ok: true }), { joined: true, track: true, error: null });
  assert.deepEqual(waitlistJoinOutcome({ ok: false, error: 'invalid_email' }), { joined: false, track: false, error: 'invalid_email' });
  assert.deepEqual(waitlistJoinOutcome({ ok: false, error: 'unavailable' }), { joined: false, track: false, error: 'unavailable' });
  assert.equal(waitlistJoinOutcome(null).track, false);
});

test('the remembered join is per account and per gate', () => {
  assert.equal(premiumWaitlistStorageKey('user-1', 'themes'), 'plot.premiumWaitlist.user-1.themes');
  assert.equal(premiumWaitlistStorageKey(null, 'smart_lists'), 'plot.premiumWaitlist.anon.smart_lists');
  assert.notEqual(
    premiumWaitlistStorageKey('user-1', 'themes'),
    premiumWaitlistStorageKey('user-1', 'smart_lists'),
  );
});
