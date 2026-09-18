import assert from 'node:assert/strict';
import test from 'node:test';
import { eligiblePlexServers, isSafePlexConnectionUrl } from '../../../../supabase/functions/_shared/plexConnectionPolicy.js';

const connectionUrl = value => new URL(value);

test('allows public literal and Plex Direct connection URLs', () => {
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://8.8.8.8:32400/status/sessions/history/all')), true);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://8-8-8-8.server-id.plex.direct:32400/status/sessions/history/all')), true);
});

test('rejects private, link-local, and unsupported connection targets', () => {
  assert.equal(isSafePlexConnectionUrl(connectionUrl('http://127.0.0.1:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('http://8.8.8.8:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('http://8-8-8-8.server-id.plex.direct:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://169.254.169.254/latest/meta-data')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://[fe80::1]:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://[fe90::1]:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('file:///etc/passwd')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('ftp://8.8.8.8:21')), false);
});

test('rejects arbitrary DNS hostnames even when a preflight lookup could be public', () => {
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://rebind.example.test:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://8-8-8-8.evil.example.test:32400')), false);
  assert.equal(isSafePlexConnectionUrl(connectionUrl('https://10-0-0-5.server-id.plex.direct:32400')), false);
});

test('uses only owned servers with resource-scoped access tokens', () => {
  const owned = { provides: 'server', owned: '1', accessToken: 'resource-token' };
  assert.deepEqual(eligiblePlexServers([
    owned,
    { provides: 'server', owned: '0', accessToken: 'shared-token' },
    { provides: 'server', owned: '1' },
    { provides: 'client', owned: '1', accessToken: 'client-token' },
  ]), [owned]);
});
