import test from 'node:test';
import assert from 'node:assert/strict';
import { titleForView, viewFromPath, VIEW_TITLES } from '../../navigation.js';

test('routes without a nav item still get a page title, never the brand', () => {
  for (const path of ['/browse', '/join-list/abc123', '/watch-with/sam/abc123', '/person/0', '/import', '/compare']) {
    const title = titleForView(viewFromPath(path));
    assert.notEqual(title, VIEW_TITLES.home, path);
    assert.ok(title.length > 0, path);
  }
  assert.equal(titleForView('browse'), 'Browse');
  assert.equal(titleForView('join-list/abc123'), 'Shared list');
  assert.equal(titleForView('watch-with/sam/abc123'), 'Watch Together');
});

test('an unknown view falls back to the brand', () => {
  assert.equal(titleForView(''), VIEW_TITLES.home);
  assert.equal(titleForView('nope/1'), VIEW_TITLES.home);
});
