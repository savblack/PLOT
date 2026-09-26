import { plexServerRequest, plexHistoryPage, publicPlexResources, selectedPlexServer, validatePlexHistory } from './plexTracking.ts';
import series from '../../../packages/core/tests/fixtures/imports/tmdb-episode-series.json' with { type: 'json' };
function assert(value: unknown) { if (!value) throw new Error('Assertion failed'); }
function rejects(fn: () => unknown) { let failed = false; try { fn(); } catch { failed = true; } assert(failed); }
Deno.test('Plex public resources never expose access tokens or connection URLs', () => {
  const rows = publicPlexResources([{ name: 'Server', clientIdentifier: 'server', provides: 'server', accessToken: 'secret', connections: [{ uri: 'https://example.test?token=secret' }] }]);
  assert(JSON.stringify(rows) === '[{"clientIdentifier":"server","name":"Server"}]');
  rejects(() => selectedPlexServer([],null));
  rejects(() => selectedPlexServer([], { clientIdentifier: 'missing', accountID: '1', name: '', profileName: '' }));
});
Deno.test('Plex admin history rejects other users, unidentified rows and malformed pages', () => {
  for (const account of ['2','']) rejects(() => validatePlexHistory(`<MediaContainer size="1"><Video title="A" accountID="${account}"/></MediaContainer>`,'1'));
  rejects(() => validatePlexHistory('<html>Login required</html>','1'));
  rejects(() => validatePlexHistory('<MediaContainer size="1"/>','1'));
  assert(validatePlexHistory('<MediaContainer size="0" totalSize="0"/>','1').items.length === 0);
});
Deno.test('Plex episodes use parent series IDs and stable watch identities with selected-user pagination', async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    await Promise.resolve(); // Model the asynchronous provider boundary.
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url);
    if (url.hostname === 'plex.tv') return new Response('<MediaContainer><Device provides="server" name="Selected" clientIdentifier="server"><Connection uri="https://8-8-8-8.test.plex.direct:32400"/></Device></MediaContainer>');
    if (url.pathname === '/accounts') return new Response('<MediaContainer><Account id="7" name="Selected profile"/><Account id="8" name="Other profile"/></MediaContainer>');
    if (url.pathname === '/status/sessions/history/all') {
      assert(url.searchParams.get('accountID') === '7');
      assert(url.searchParams.get('X-Plex-Container-Start') === '0');
      return new Response('<MediaContainer size="2" totalSize="2"><Video title="Episode" type="episode" accountID="7" ratingKey="20" grandparentRatingKey="10" parentIndex="1" index="3" historyKey="/status/sessions/history/100"/><Video title="Episode" type="episode" accountID="7" ratingKey="20" grandparentRatingKey="10" parentIndex="1" index="3" historyKey="/status/sessions/history/101"/></MediaContainer>');
    }
    if (url.pathname === '/library/metadata/10') return new Response(`<MediaContainer><Directory ratingKey="10" title="${series.result.name}" type="show"><Guid id="tmdb://${series.result.id}"/></Directory></MediaContainer>`);
    throw new Error('Unexpected URL');
  }) as typeof fetch;
  try {
    const page = await plexHistoryPage('token', { clientIdentifier: 'server', accountID: '7', name: '', profileName: '' },0);
    assert(page.done && page.offset === 2 && page.records.length === 2);
    assert(page.records[0].event.tmdb_id === series.result.id && page.records[0].event.episode_number === 3);
    assert(page.records[0].event.watched_at === null && page.records[0].event.source_key !== page.records[1].event.source_key);
    assert(requests.filter(url => url.pathname === '/library/metadata/10').length === 1);
    assert(requests.every(url => !url.searchParams.has('X-Plex-Token')));
  } finally { globalThis.fetch = original; }
});

Deno.test('Plex skips local, invalid and duplicate URLs before counting remote attempts', async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    await Promise.resolve();
    const url = new URL(input instanceof Request ? input.url : input);
    requested.push(url.hostname);
    return requested.length === 1 ? new Response('', { status: 503 }) : new Response('<MediaContainer/>');
  }) as typeof fetch;
  try {
    const result = await plexServerRequest({ connections: [
      { uri: 'not a URL' }, { uri: 'http://192.168.1.2:32400' },
      { uri: 'https://8-8-8-8.test.plex.direct:32400' },
      { uri: 'https://8-8-8-8.test.plex.direct:32400' },
      { uri: 'https://1-1-1-1.test.plex.direct:32400' },
    ] }, 'test-token', '/accounts');
    assert(result === '<MediaContainer/>');
    assert(JSON.stringify(requested) === JSON.stringify(['8-8-8-8.test.plex.direct', '1-1-1-1.test.plex.direct']));
  } finally { globalThis.fetch = original; }
});
