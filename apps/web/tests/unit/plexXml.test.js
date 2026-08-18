import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlexItems, parsePlexResources, xmlAttrs } from '../../../../supabase/functions/_shared/plexXml.js';

// Shapes taken from real Plex responses. parsePlexItems is the one that must not
// silently stop matching: a sync whose parser returns nothing looks like an empty
// library rather than a failure.

const WATCHLIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="3">
  <Video ratingKey="5d77683f" guid="plex://movie/5d776b9ab2a7f2001f7f0d4a" type="movie" title="The Matrix" year="1999">
    <Guid id="imdb://tt0133093"/>
    <Guid id="tmdb://603"/>
    <Guid id="tvdb://12345"/>
  </Video>
  <Directory ratingKey="5d9c07f6" guid="plex://show/5d9c081a9f0e0d001f5d3f3c" type="show" title="Ghosts" year="2019">
    <Guid id="tmdb://85422"/>
  </Directory>
  <Video ratingKey="legacy1" guid="com.plexapp.agents.themoviedb://278?lang=en" type="movie" title="The Shawshank Redemption" year="1994"/>
</MediaContainer>`;

test('parsePlexItems reads attributes from both the paired and self-closing form', () => {
  const items = parsePlexItems(WATCHLIST_XML);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(i => i.title), ['The Matrix', 'Ghosts', 'The Shawshank Redemption']);
  assert.deepEqual(items.map(i => i.type), ['movie', 'show', 'movie']);
  assert.equal(items[2].ratingKey, 'legacy1', 'a self-closing entry still yields its attributes');
});

test('parsePlexItems collects nested Guid ids and the guid attribute', () => {
  const [matrix, ghosts, shawshank] = parsePlexItems(WATCHLIST_XML);
  assert.deepEqual(matrix.guids, [
    'imdb://tt0133093', 'tmdb://603', 'tvdb://12345',
    'plex://movie/5d776b9ab2a7f2001f7f0d4a',
  ]);
  assert.deepEqual(ghosts.guids, ['tmdb://85422', 'plex://show/5d9c081a9f0e0d001f5d3f3c']);
  assert.deepEqual(shawshank.guids, ['com.plexapp.agents.themoviedb://278?lang=en']);
});

test('parsePlexItems does not leak one entry\'s guids into the next', () => {
  const [matrix, ghosts] = parsePlexItems(WATCHLIST_XML);
  assert.ok(!matrix.guids.includes('tmdb://85422'));
  assert.ok(!ghosts.guids.includes('tmdb://603'));
});

test('parsePlexItems keeps episodes, which title themselves on the show', () => {
  const xml = `<MediaContainer>
    <Video ratingKey="9" type="episode" grandparentTitle="Severance" title="Good News About Hell" viewedAt="1717200000"/>
  </MediaContainer>`;
  const [ep] = parsePlexItems(xml);
  assert.equal(ep.grandparentTitle, 'Severance');
  assert.equal(ep.viewedAt, '1717200000');
});

test('parsePlexItems drops entries with no title at all', () => {
  assert.deepEqual(parsePlexItems('<MediaContainer><Video ratingKey="1" type="movie"/></MediaContainer>'), []);
  assert.deepEqual(parsePlexItems(''), []);
  assert.deepEqual(parsePlexItems(undefined), []);
});

test('xmlAttrs decodes entities in attribute values', () => {
  const attrs = xmlAttrs('<Video title="Fire &amp; Rain &quot;live&quot;" summary="a &lt;b&gt;"/>');
  assert.equal(attrs.title, 'Fire & Rain "live"');
  assert.equal(attrs.summary, 'a <b>');
});

test('parsePlexResources pairs each device with its connections', () => {
  const xml = `<MediaContainer>
    <Device name="Study" clientIdentifier="abc" accessToken="tok">
      <Connection protocol="https" address="10.0.0.2" port="32400" uri="https://10-0-0-2.abc.plex.direct:32400" local="1"/>
      <Connection protocol="https" address="1.2.3.4" port="32400" uri="https://1-2-3-4.abc.plex.direct:32400" local="0"/>
    </Device>
  </MediaContainer>`;
  const [device] = parsePlexResources(xml);
  assert.equal(device.name, 'Study');
  assert.equal(device.connections.length, 2);
  assert.equal(device.connections[1].address, '1.2.3.4');
});
