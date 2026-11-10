import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePanelParam, searchWithPanel, samePanel, panelParamValue } from '../../panelLink.js';

test('a panel link round-trips through the query string and keeps other parameters', () => {
  const search = searchWithPanel('?type=tv&genre=18', { id: 1396, type: 'tv' });
  assert.equal(search, '?type=tv&genre=18&panel=tv-1396');
  assert.deepEqual(parsePanelParam(search), { id: 1396, type: 'tv' });
  assert.equal(searchWithPanel(search, null), '?type=tv&genre=18');
  assert.equal(searchWithPanel('?panel=movie-1', null), '');
  assert.equal(searchWithPanel('', { id: 9, type: 'collection' }), '?panel=collection-9');
});

test('opening another title replaces the panel instead of adding a second one', () => {
  const search = searchWithPanel('?panel=collection-9&section=x', { id: 5, type: 'movie' });
  assert.equal(search, '?panel=movie-5&section=x');
});

test('a value this app does not write is ignored, not guessed at', () => {
  for (const bad of ['', '?panel=', '?panel=movie', '?panel=movie-', '?panel=movie-abc', '?panel=person-12', '?panel=movie-0', '?panel=movie--3', '?panel=movie-1.5', '?panel=MOVIE-3', '?other=movie-3', '?panel=movie-99999999999999999999']) {
    assert.equal(parsePanelParam(bad), null, bad);
  }
  assert.equal(parsePanelParam(null), null);
  assert.equal(parsePanelParam(undefined), null);
});

test('samePanel compares id and type, and nothing is the same as no panel', () => {
  assert.equal(samePanel({ id: 1, type: 'movie' }, { id: '1', type: 'movie' }), true);
  assert.equal(samePanel({ id: 1, type: 'movie' }, { id: 1, type: 'tv' }), false);
  assert.equal(samePanel(null, { id: 1, type: 'tv' }), false);
  assert.equal(samePanel(null, null), false);
  assert.equal(panelParamValue({ id: 603, type: 'movie' }), 'movie-603');
});
