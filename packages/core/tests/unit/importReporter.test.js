import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { createImportReporter, importEntryFromParam, IMPORT_ENTRY_POINTS, IMPORT_FAILURE_REASONS } from '../../importPipeline.js';

const capture = () => {
  const events = [];
  configure({ onImport: (payload) => events.push(payload) });
  return events;
};

test('the entry point comes from ?from=, and anything unknown is the import page', () => {
  assert.equal(importEntryFromParam('onboarding'), IMPORT_ENTRY_POINTS.ONBOARDING);
  assert.equal(importEntryFromParam('finishing_touches'), IMPORT_ENTRY_POINTS.FINISHING_TOUCHES);
  assert.equal(importEntryFromParam('somewhere-else'), IMPORT_ENTRY_POINTS.IMPORT_PAGE);
  assert.equal(importEntryFromParam(null), IMPORT_ENTRY_POINTS.IMPORT_PAGE);
});

test('a file import reports where it began, how long it took and how long the write took', () => {
  const events = capture();
  let t = 1000;
  const r = createImportReporter({ entry: 'onboarding', now: () => t });
  r.selected('letterboxd');
  r.report('started', { source: 'letterboxd', count: 120 });
  t = 31000; // half a minute reviewing the preview
  r.writing();
  t = 34500;
  r.outcome('letterboxd', { inserted: 118, failed: 2 });
  assert.deepEqual(events, [
    { stage: 'selected', source: 'letterboxd', entry: 'onboarding' },
    { stage: 'started', source: 'letterboxd', count: 120, entry: 'onboarding' },
    { stage: 'completed', source: 'letterboxd', count: 118, failed_count: 2, entry: 'onboarding', duration_ms: 33500, write_ms: 3500 },
  ]);
  configure({ onImport: undefined });
});

test('a write that saved nothing is still a failure, with timing', () => {
  const events = capture();
  let t = 0;
  const r = createImportReporter({ now: () => t });
  r.report('started', { source: 'netflix' });
  r.writing();
  t = 2000;
  r.outcome('netflix', { inserted: 0, failed: 9 });
  assert.equal(events[1].stage, 'failed');
  assert.equal(events[1].reason, IMPORT_FAILURE_REASONS.WRITE_FAILED);
  assert.equal(events[1].entry, 'import_page');
  assert.equal(events[1].duration_ms, 2000);
  configure({ onImport: undefined });
});

test('a failure before anything started carries no duration, and timing never goes negative', () => {
  const events = capture();
  let t = 500;
  const r = createImportReporter({ entry: 'finishing_touches', now: () => t });
  r.report('failed', { source: 'trakt', reason: IMPORT_FAILURE_REASONS.UNREADABLE_FILE });
  assert.equal('duration_ms' in events[0], false);
  r.report('started', { source: 'plex' });
  t = 100; // a clock that went backwards
  r.report('completed', { source: 'plex', count: 3 });
  assert.equal(events[2].duration_ms, 0);
  assert.equal('write_ms' in events[2], false);
  configure({ onImport: undefined });
});

test('Letterboxd export and abandonment are their own stages and do not time a write', () => {
  const events = capture();
  const r = createImportReporter({ entry: 'import_page', now: () => 10 });
  r.exportOpened();
  r.abandoned('left');
  r.abandoned('dismissed');
  assert.deepEqual(events, [
    { stage: 'export_opened', source: 'letterboxd', entry: 'import_page' },
    { stage: 'abandoned', source: 'letterboxd', entry: 'import_page', reason: 'left' },
    { stage: 'abandoned', source: 'letterboxd', entry: 'import_page', reason: 'dismissed' },
  ]);
  configure({ onImport: undefined });
});
