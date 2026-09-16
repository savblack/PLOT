import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTitleShareUrl, buildListShareUrl, buildProfileShareUrl, SHARE_ORIGIN } from '../../sharing.js';

test('profile sharing includes the invitation to follow', () => {
  const url = new URL(buildProfileShareUrl({ username: '@someone' }));
  assert.equal(url.origin, SHARE_ORIGIN);
  assert.equal(url.pathname, '/u/someone');
  assert.equal(url.searchParams.get('src'), 'profile_share');
  assert.equal(url.searchParams.get('ref'), 'someone');
});

test('profile invitations trim the person to follow through signup', () => {
  const url = new URL(buildProfileShareUrl({ username: ' someone ' }));
  assert.equal(url.searchParams.get('ref'), 'someone');
  assert.equal(url.searchParams.get('src'), 'profile_share');
});

test('list identifiers cannot inject another route or referral', () => {
  const url = new URL(buildListShareUrl({ listId: 'a/b?ref=someone' }));
  assert.equal(url.pathname, '/list/a%2Fb%3Fref%3Dsomeone');
  assert.equal(url.searchParams.get('src'), 'list_share');
  assert.equal(url.searchParams.has('ref'), false);
});

test('missing subjects and unsafe origins do not produce shareable links', () => {
  assert.equal(buildProfileShareUrl(), null);
  assert.equal(buildListShareUrl(), null);
  assert.equal(buildListShareUrl({ listId: 'list', origin: 'javascript:alert(1)' }), null);
  assert.equal(buildProfileShareUrl({ username: 'someone', origin: 'invalid' }), null);
  assert.equal(buildTitleShareUrl({ tmdbId: Number.MAX_SAFE_INTEGER + 1, mediaType: 'movie' }), null);
});
