import assert from 'node:assert/strict';
import test from 'node:test';

import { configure } from '../../config.js';
import { EVENTS } from '../../analyticsEvents.js';
import { reviewEventPayload, reviewLengthBucket } from '../../useHistory.js';
import { pickerDrawPayload, defaultPickerOptions } from '../../tonightPicker.js';
import { reportImport, reportImportOutcome, IMPORT_FAILURE_REASONS } from '../../importPipeline.js';

/* ── review_written ── */

test('reviewLengthBucket splits a line, a paragraph and an essay', () => {
  assert.equal(reviewLengthBucket('Loved it.'), 'short');
  assert.equal(reviewLengthBucket('x'.repeat(80)), 'medium');
  assert.equal(reviewLengthBucket('x'.repeat(400)), 'long');
});

test('reviewEventPayload fires for new or changed text, never the text itself', () => {
  const payload = reviewEventPayload({ tmdb_id: 1, media_type: 'movie', note: '  A quiet, patient film. ', rating: 8 });
  assert.deepEqual(payload, { tmdb_id: 1, media_type: 'movie', has_rating: true, length: 'short', edited: false });
  assert.ok(!JSON.stringify(payload).includes('patient'));

  const edited = reviewEventPayload({ tmdb_id: 1, media_type: 'movie', note: 'Better second time.', previousNote: 'Fine.', rating: null });
  assert.equal(edited.edited, true);
  assert.equal(edited.has_rating, false);
});

test('reviewEventPayload stays quiet when no review was written', () => {
  // A star-only re-save sends the same note back; that is a rating, not a review.
  assert.equal(reviewEventPayload({ tmdb_id: 1, media_type: 'tv', note: 'Same words', previousNote: 'Same words ' }), null);
  assert.equal(reviewEventPayload({ tmdb_id: 1, media_type: 'tv', note: null, previousNote: 'Gone' }), null);
  assert.equal(reviewEventPayload({ tmdb_id: 1, media_type: 'tv', note: '   ' }), null);
  assert.equal(reviewEventPayload({ tmdb_id: 1, media_type: 'tv' }), null);
});

/* ── Tonight picker ── */

test('pickerDrawPayload reports the shape of the request, not the genres', () => {
  const options = { ...defaultPickerOptions({ hasServices: true }), mediaType: 'tv', genreIds: [18, 35], onlyWatchlist: true };
  const payload = pickerDrawPayload(options, { mode: 'five', resultCount: 0, reroll: true, hasServices: false });

  assert.deepEqual(payload, {
    mode: 'five', media_type: 'tv', result_count: 0, reroll: true,
    only_watchlist: true,
    // Asked for, but the viewer has no services, so the filter did nothing.
    only_services: false,
    genre_count: 2,
  });
  assert.ok(!JSON.stringify(payload).includes('18'));
});

test('the Tonight events are in the catalog', () => {
  assert.equal(EVENTS.TONIGHT_PICKS_DRAWN, 'tonight_picks_drawn');
  assert.equal(EVENTS.TONIGHT_PICK_OPENED, 'tonight_pick_opened');
  assert.equal(EVENTS.TONIGHT_SEARCH_SAVED, 'tonight_search_saved');
  assert.equal(EVENTS.TONIGHT_SAVED_SEARCH_OPENED, 'tonight_saved_search_opened');
  assert.equal(EVENTS.REVIEW_WRITTEN, 'review_written');
  assert.equal(EVENTS.IMPORT_FAILED, 'import_failed');
});

/* ── Imports ── */

function captureImports() {
  const events = [];
  configure({ onImport: (payload) => events.push(payload) });
  return events;
}

test('reportImportOutcome completes a write that saved anything, partial failures included', () => {
  const events = captureImports();
  reportImportOutcome('letterboxd', { inserted: 40, failed: 2, duplicates: 3 });
  assert.deepEqual(events, [{ stage: 'completed', source: 'letterboxd', count: 40, failed_count: 2 }]);
});

test('reportImportOutcome files a write that saved nothing as a failure, so it cannot activate anyone', () => {
  const events = captureImports();
  reportImportOutcome('netflix', { inserted: 0, failed: 12 });
  assert.deepEqual(events, [{ stage: 'failed', source: 'netflix', reason: 'write_failed', failed_count: 12 }]);
});

test('an import with nothing new to write still completes', () => {
  // Everything already in history: not an error, and the user did finish.
  const events = captureImports();
  reportImportOutcome('imdb', { inserted: 0, failed: 0, duplicates: 9 });
  assert.equal(events[0].stage, 'completed');
});

test('reportImport never throws and failure reasons are slugs', () => {
  configure({ onImport: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => reportImport('started', { source: 'plex' }));
  configure({ onImport: undefined });
  for (const reason of Object.values(IMPORT_FAILURE_REASONS)) assert.match(reason, /^[a-z]+(_[a-z]+)*$/);
});
