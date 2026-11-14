import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseCountdown, releaseCaption } from '../../countdown.js';
import { MEDIA } from '../../copy/media.js';

const now = new Date(2026, 10, 13, 15, 0, 0); // Nov 13, 2026, mid-afternoon local

test('countdown stages by days from today', () => {
  assert.equal(releaseCountdown('2026-11-12', now).stage, 'past');
  assert.deepEqual(
    [releaseCountdown('2026-11-13', now).label, releaseCountdown('2026-11-14', now).label, releaseCountdown('2026-11-16', now).label],
    [MEDIA.today, MEDIA.tomorrow, MEDIA.inDays(3)],
  );
  assert.equal(releaseCountdown('2026-12-25', now).stage, 'later');
  assert.equal(releaseCountdown(null, now), null);
  assert.equal(releaseCountdown('soon', now), null);
});

test('captions prefer the streaming date and skip what is out', () => {
  assert.equal(releaseCaption({ release_date: '2026-11-14', streaming_date: '2026-11-16' }, now), MEDIA.streamingWhen(MEDIA.inDaysPhrase(3)));
  assert.equal(releaseCaption({ release_date: '2026-11-14' }, now), MEDIA.outWhen('tomorrow'));
  assert.equal(releaseCaption({ release_date: '2026-01-01' }, now), null);
});
