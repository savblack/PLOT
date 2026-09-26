// Who gets a new_episode notification, given that they follow a show that just
// aired. Pure, so the rules are unit-tested rather than trusted
// (newEpisodeRecipients.test.ts); new-episode-notifications gathers the inputs.
//
// A notification that is already stale when it lands teaches people to ignore
// the bell, so each rule removes one way of telling someone what they know:
//
//   followed_after — they followed the show on or after the air date. The
//     common case is adding a show *because* it just dropped; "season 5 is out"
//     the next morning is an echo. followedAt is the earliest of their list and
//     progress rows. A null (list_items.created_at is nullable) counts as long
//     before, so an old row is never silently dropped.
//   watched — their progress is past the first episode of the drop.
//     watching_progress.current_episode is the NEXT episode to watch (see
//     packages/core/calendar.js), so they have seen episode e of season s when
//     they are on a later season, or on season s with current_episode > e. For a
//     multi-episode drop, having started it is enough: they know it is out.
//   dnf — the latest history row for the show is marked did-not-finish. A show
//     can stay on a list after someone gives up on it; a later non-dnf row (a
//     second try) means they are back and are notified again.

export type Progress = { season: number; episode: number };

export type Follower = {
  userId: string;
  followedAt: string | null;
  progress: Progress | null;
  dnf: boolean;
};

export type AiredEpisode = { airDate: string; season: number; firstEpisode: number };

export type SkipReason = 'followed_after' | 'watched' | 'dnf';

/** Why this follower should NOT be notified, or null to notify them. */
export function skipReason(f: Follower, ep: AiredEpisode): SkipReason | null {
  if (f.dnf) return 'dnf';
  // Calendar-date comparison: a follow any time on the air date counts as after.
  if (f.followedAt && f.followedAt.slice(0, 10) >= ep.airDate) return 'followed_after';
  if (f.progress && (
    f.progress.season > ep.season ||
    (f.progress.season === ep.season && f.progress.episode > ep.firstEpisode)
  )) return 'watched';
  return null;
}

/** The earlier of two nullable timestamps; null only when both are null. */
export function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

export type HistoryRow = { dnf: boolean; watched_at: string | null; created_at: string | null };

/** True when the most recent history row for a show is did-not-finish. */
export function latestIsDnf(rows: HistoryRow[]): boolean {
  let latest: HistoryRow | null = null;
  let latestAt = -Infinity;
  for (const row of rows) {
    const at = Date.parse(row.watched_at ?? row.created_at ?? '') || 0;
    if (!latest || at >= latestAt) { latest = row; latestAt = at; }
  }
  return latest?.dnf === true;
}
