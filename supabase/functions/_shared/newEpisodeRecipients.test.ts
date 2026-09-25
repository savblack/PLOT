// The three reasons new-episode-notifications stays quiet. Each one is a way of
// telling someone something they already know, so each is pinned here.
import { assertEquals } from 'jsr:@std/assert@1';
import { earliest, latestIsDnf, skipReason, type Follower } from './newEpisodeRecipients.ts';

const ep = { airDate: '2026-09-23', season: 5, firstEpisode: 1 };
const follower = (over: Partial<Follower> = {}): Follower => ({
  userId: 'u', followedAt: '2026-06-01T10:00:00Z', progress: null, dnf: false, ...over,
});

Deno.test('a long-time follower with no progress is notified', () => {
  assertEquals(skipReason(follower(), ep), null);
});

Deno.test('a follow on or after the air date is an echo, not news', () => {
  assertEquals(skipReason(follower({ followedAt: '2026-09-23T02:00:00Z' }), ep), 'followed_after');
  assertEquals(skipReason(follower({ followedAt: '2026-09-24T09:00:00Z' }), ep), 'followed_after');
  assertEquals(skipReason(follower({ followedAt: '2026-09-22T23:59:00Z' }), ep), null);
});

Deno.test('an unknown follow time counts as long before, so old rows are never dropped', () => {
  assertEquals(skipReason(follower({ followedAt: null }), ep), null);
});

Deno.test('current_episode is the next to watch: past the first of the drop means watched', () => {
  const drop = { airDate: '2026-09-23', season: 2, firstEpisode: 4 };
  // Next up is E4: they have not seen it.
  assertEquals(skipReason(follower({ progress: { season: 2, episode: 4 } }), drop), null);
  // Next up is E5: they watched E4, the start of the drop.
  assertEquals(skipReason(follower({ progress: { season: 2, episode: 5 } }), drop), 'watched');
  // Already on a later season.
  assertEquals(skipReason(follower({ progress: { season: 3, episode: 1 } }), drop), 'watched');
  // Behind, on an earlier season: still news.
  assertEquals(skipReason(follower({ progress: { season: 1, episode: 9 } }), drop), null);
});

Deno.test('dnf wins over everything else', () => {
  assertEquals(skipReason(follower({ dnf: true, progress: { season: 1, episode: 1 } }), ep), 'dnf');
});

Deno.test('latestIsDnf reads only the most recent history row', () => {
  assertEquals(latestIsDnf([]), false);
  assertEquals(latestIsDnf([{ dnf: true, watched_at: '2026-05-01T00:00:00Z', created_at: null }]), true);
  // Gave up, then came back: not dnf any more.
  assertEquals(latestIsDnf([
    { dnf: true, watched_at: '2026-05-01T00:00:00Z', created_at: null },
    { dnf: false, watched_at: '2026-08-01T00:00:00Z', created_at: null },
  ]), false);
  // Falls back to created_at when watched_at is missing.
  assertEquals(latestIsDnf([
    { dnf: false, watched_at: null, created_at: '2026-01-01T00:00:00Z' },
    { dnf: true, watched_at: null, created_at: '2026-03-01T00:00:00Z' },
  ]), true);
});

Deno.test('earliest picks the earlier timestamp and tolerates nulls', () => {
  assertEquals(earliest(null, null), null);
  assertEquals(earliest('2026-01-02T00:00:00Z', null), '2026-01-02T00:00:00Z');
  assertEquals(earliest('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'), '2026-01-01T00:00:00Z');
});
