import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brevoDate,
  readableList,
  titleDeepLink,
  parseTitleDeepLink,
  trackingSnapshot,
  lifecycleAttributes,
  onboardingEventProperties,
  onboardingContactProperties,
  listIdsForContact,
  shouldSendOnboardingEvent,
  isRetryableBrevoStatus,
  ONBOARDING_EVENT,
} from '../../brevoLifecycle.js';

const bear = { name: 'The Bear', poster_path: '/bear.jpg', tmdbId: 11, mediaType: 'tv' };
const shogun = { name: 'Shogun', poster_path: '/shogun.jpg', tmdbId: 22, mediaType: 'tv' };
const past = { name: 'Past Lives', poster_path: null, tmdbId: 33, mediaType: 'movie' };

test('brevoDate keeps the calendar day and drops a bad value', () => {
  assert.equal(brevoDate('2026-10-12T18:04:00.000Z'), '2026-10-12');
  assert.equal(brevoDate('2026-09-04'), '2026-09-04');
  assert.equal(brevoDate('nope'), undefined);
  assert.equal(brevoDate(null), undefined);
});

test('readableList uses a serial comma and stops at the limit', () => {
  assert.equal(readableList([]), '');
  assert.equal(readableList(['The Bear']), 'The Bear');
  assert.equal(readableList(['The Bear', 'Shogun']), 'The Bear and Shogun');
  assert.equal(readableList(['The Bear', 'Shogun', 'Past Lives']), 'The Bear, Shogun, and Past Lives');
  assert.equal(readableList(['a', 'b', 'c', 'd'], 2), 'a and b');
});

test('titleDeepLink is the /save URL that opens a title', () => {
  assert.equal(
    titleDeepLink({ tmdbId: 11, mediaType: 'show' }),
    'https://app.theplot.tv/save?media_type=tv&tmdb_id=11&src=lifecycle',
  );
  assert.equal(titleDeepLink({ tmdbId: 0, mediaType: 'movie' }), null);
  assert.equal(titleDeepLink({ tmdbId: 5, mediaType: 'book' }), null);
});

test('parseTitleDeepLink reads the same URL back', () => {
  const url = titleDeepLink({ tmdbId: 33, mediaType: 'movie' });
  assert.deepEqual(parseTitleDeepLink(url), { tmdbId: 33, mediaType: 'movie' });
  assert.equal(parseTitleDeepLink('https://app.theplot.tv/home'), null);
  assert.deepEqual(parseTitleDeepLink('plot://save?media_type=tv&tmdb_id=9'), { tmdbId: 9, mediaType: 'tv' });
});

test('trackingSnapshot counts a watched title, a rating, and a show in progress once', () => {
  const snapshot = trackingSnapshot(
    [
      { tmdb_id: 1, media_type: 'movie', watched_at: '2026-10-01', title: 'One' },
      { tmdb_id: 1, media_type: 'movie', rating: 8, updatedAt: '2026-10-02T00:00:00.000Z' },
      { tmdb_id: 2, media_type: 'tv', note: '  ', watched_at: null, rating: null, dnf: false },
      { tmdb_id: 3, media_type: 'movie', dnf: true, created_at: '2026-09-01T00:00:00.000Z' },
      { tmdb_id: 4, media_type: 'tv', watched_at: '2026-10-04' },
    ],
    [{ tmdb_id: 4, updated_at: '2026-10-11T15:00:00.000Z' }],
  );
  // Movie 1 is logged twice and counts once. Show 4 is in history and in
  // progress and counts once. Movie and TV ids are separate. A blank note does not count.
  assert.equal(snapshot.trackCount, 3);
  assert.equal(snapshot.lastTrackAt, '2026-10-11');
});

test('lifecycle attributes carry the watchlist slots and omit an unknown date', () => {
  const attributes = lifecycleAttributes({
    trackCount: 2,
    lastTrackAt: null,
    lastSeenAt: '2026-10-12T01:00:00.000Z',
    imported: true,
    titles: [bear, shogun, past, { name: 'Fourth', tmdbId: 4, mediaType: 'movie' }],
  });
  assert.equal(attributes.TRACK_COUNT, 2);
  assert.equal(attributes.IMPORTED, true);
  assert.equal(attributes.LAST_SEEN_AT, '2026-10-12');
  assert.equal(attributes.LAST_TRACK_AT, undefined);
  assert.equal(attributes.SAVED_TITLES, 'The Bear, Shogun, and Past Lives');
  assert.equal(attributes.TITLE_1_NAME, 'The Bear');
  assert.equal(attributes.TITLE_1_URL, 'https://app.theplot.tv/save?media_type=tv&tmdb_id=11&src=lifecycle');
  assert.equal(attributes.TITLE_1_POSTER_URL, 'https://image.tmdb.org/t/p/w342/bear.jpg');
  assert.equal(attributes.TITLE_3_POSTER_URL, '');
  assert.equal(attributes.TITLE_4_NAME, undefined);
});

test('onboarding event properties are flat and the contact date is the completion day', () => {
  assert.equal(ONBOARDING_EVENT, 'onboarding_completed');
  const event = onboardingEventProperties({
    titles: [bear],
    imported: false,
    pickedCount: 4,
    providers: [{ name: 'Netflix' }, { provider_name: 'Hulu' }, { name: 'Netflix' }],
  });
  assert.equal(event.imported, false);
  assert.equal(event.picked_count, 4);
  assert.equal(event.streaming_services, 'Netflix and Hulu');
  assert.equal(event.title_1_name, 'The Bear');
  assert.equal(event.title_2_name, undefined);

  const contact = onboardingContactProperties({
    completedAt: '2026-10-12T20:00:00.000Z',
    titles: [bear],
    imported: false,
  });
  assert.equal(contact.ONBOARDING_COMPLETED_AT, '2026-10-12');
  assert.equal(contact.IMPORTED, false);
  assert.equal(contact.SAVED_TITLES, 'The Bear');
});

test('a blacklisted contact is not re-listed and does not get the onboarding event', () => {
  assert.equal(listIdsForContact({ emailBlacklisted: true }, [4, 5]), undefined);
  assert.deepEqual(listIdsForContact(null, [4]), [4]);
  assert.equal(listIdsForContact({ emailBlacklisted: false }, []), undefined);
  assert.equal(shouldSendOnboardingEvent({ emailBlacklisted: true }), false);
  assert.equal(shouldSendOnboardingEvent(null), true);
  assert.equal(shouldSendOnboardingEvent({ emailBlacklisted: false }), true);
});

test('retry a dead key or a rate limit, and stop on a rejected payload', () => {
  assert.equal(isRetryableBrevoStatus(401), true);
  assert.equal(isRetryableBrevoStatus(429), true);
  assert.equal(isRetryableBrevoStatus(503), true);
  assert.equal(isRetryableBrevoStatus(null), true);
  assert.equal(isRetryableBrevoStatus(400), false);
  assert.equal(isRetryableBrevoStatus(404), false);
});
