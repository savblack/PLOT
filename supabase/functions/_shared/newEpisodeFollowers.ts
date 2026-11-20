// Who follows which show, for the two new_episode jobs: the daily
// new-episode-notifications sweep and the 15-minute episode-drop-alerts run.
// Moved out of new-episode-notifications so both read followers the same way.
// The skip rules themselves are in newEpisodeRecipients.ts.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from './database.types.ts';
import { earliest, latestIsDnf, type Follower, type HistoryRow } from './newEpisodeRecipients.ts';

type Db = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 200;

/**
 * Every followed show id → its followers, with when they followed and their
 * progress. With `onlyIds`, just those shows (the 15-minute job reads only
 * what just dropped); without, every followed show (the daily sweep).
 */
export async function followersByShow(db: Db, onlyIds?: number[]): Promise<Map<number, Map<string, Follower>>> {
  const byShow = new Map<number, Map<string, Follower>>();
  const follower = (tmdbId: number, userId: string): Follower => {
    let show = byShow.get(tmdbId);
    if (!show) byShow.set(tmdbId, show = new Map());
    let f = show.get(userId);
    if (!f) show.set(userId, f = { userId, followedAt: null, progress: null, dnf: false });
    return f;
  };
  // followedAt is the earliest timestamp across a person's rows for the show.
  // A row with no timestamp means "unknown, so assume long ago", and that has
  // to stick: otherwise a later row's timestamp would make an old follow look
  // recent and skip them as followed_after.
  const unknownFollow = new Set<Follower>();
  const noteFollow = (f: Follower, at: string | null) => {
    if (unknownFollow.has(f)) return;
    if (!at) { unknownFollow.add(f); f.followedAt = null; return; }
    f.followedAt = earliest(f.followedAt, at);
  };

  // One pass over all shows, or one per chunk of the requested ids.
  const scopes: (number[] | null)[] = onlyIds
    ? Array.from({ length: Math.ceil(onlyIds.length / ID_CHUNK) }, (_, i) => onlyIds.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
    : [null];

  for (const ids of scopes) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = db.from('list_items')
        .select('user_id, tmdb_id, created_at')
        .eq('media_type', 'tv');
      if (ids) query = query.in('tmdb_id', ids);
      const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`list_items read failed: ${error.message}`);
      for (const row of data ?? []) noteFollow(follower(row.tmdb_id, row.user_id), row.created_at);
      if (!data || data.length < PAGE_SIZE) break;
    }

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = db.from('watching_progress')
        .select('user_id, tmdb_id, started_at, current_season, current_episode');
      if (ids) query = query.in('tmdb_id', ids);
      const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`watching_progress read failed: ${error.message}`);
      for (const row of data ?? []) {
        const f = follower(row.tmdb_id, row.user_id);
        noteFollow(f, row.started_at);
        f.progress = { season: row.current_season, episode: row.current_episode };
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  return byShow;
}

/** Marks followers who turned Episode alerts off for an aired show. */
export async function markMuted(db: Db, byShow: Map<number, Map<string, Follower>>, showIds: number[]) {
  for (let i = 0; i < showIds.length; i += ID_CHUNK) {
    const ids = showIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db.from('episode_alert_mutes')
        .select('user_id, tmdb_id')
        .in('tmdb_id', ids)
        .order('user_id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`episode_alert_mutes read failed: ${error.message}`);
      for (const row of data ?? []) {
        const f = byShow.get(row.tmdb_id)?.get(row.user_id);
        if (f) f.muted = true;
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
}

/** Marks followers whose latest history row for an aired show is did-not-finish. */
export async function markDnf(db: Db, byShow: Map<number, Map<string, Follower>>, showIds: number[]) {
  const rowsByKey = new Map<string, HistoryRow[]>();
  for (let i = 0; i < showIds.length; i += ID_CHUNK) {
    const ids = showIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db.from('history')
        .select('id, user_id, tmdb_id, dnf, watched_at, created_at')
        .eq('media_type', 'tv')
        .in('tmdb_id', ids)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`history read failed: ${error.message}`);
      for (const row of data ?? []) {
        const key = `${row.tmdb_id}:${row.user_id}`;
        let list = rowsByKey.get(key);
        if (!list) rowsByKey.set(key, list = []);
        list.push({ dnf: row.dnf, watched_at: row.watched_at, created_at: row.created_at });
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  for (const [key, rows] of rowsByKey) {
    const [tmdbId, userId] = key.split(':');
    const f = byShow.get(Number(tmdbId))?.get(userId);
    if (f) f.dnf = latestIsDnf(rows);
  }
}

/**
 * Marks everyone who turned "Episode alerts in Plot" off
 * (notification_preferences.episode_alerts, 20261120110000). A missing row
 * means on.
 */
export async function markAlertsOff(db: Db, byShow: Map<number, Map<string, Follower>>) {
  const off = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('notification_preferences')
      .select('user_id')
      .eq('episode_alerts', false)
      .order('user_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`notification_preferences read failed: ${error.message}`);
    for (const row of data ?? []) off.add(row.user_id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  if (!off.size) return;
  for (const show of byShow.values()) {
    for (const f of show.values()) if (off.has(f.userId)) f.alertsOff = true;
  }
}
