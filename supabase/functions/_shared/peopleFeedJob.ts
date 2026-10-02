// Refreshes people_feed for a set of followed people. Shared by the daily
// premium-alerts run (every followed person) and people-feed-refresh (the one
// person someone just followed, so Your people fills in straight away).
//
// The rules are pure functions in ./premiumAlerts.js; this file is only the
// TMDB fetching and the writes.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from './database.types.ts';
import {
  feedCandidates, isoDay, PEOPLE_LOOK_BACK_DAYS, premiereDrop, regionalReleases, showSeasons,
} from './premiumAlerts.js';

type Db = SupabaseClient<Database>;
export type FeedRow = Database['public']['Tables']['people_feed']['Insert'];

const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_CONCURRENCY = 6;
const UPSERT_CHUNK = 500;
const ID_CHUNK = 200;

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function tmdbGet(path: string, key: string): Promise<any> {
  const res = await fetch(`${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}&language=en-US`);
  if (!res.ok) throw new Error(`TMDB ${path} failed (${res.status})`);
  return await res.json();
}

export type RefreshStats = { calls: number; failures: number; people: number; rows: number };

/**
 * Fetch every followed person's credits, the films' regional release dates and
 * the shows' seasons, and write the result to people_feed. Rows for these
 * people that no longer qualify are removed. Returns the rows written.
 */
export async function refreshPeopleFeed(
  db: Db, tmdbKey: string, people: Array<{ id: number; name: string }>, now: Date, { write = true } = {},
): Promise<{ rows: FeedRow[]; stats: RefreshStats }> {
  const today = isoDay(now);
  const stats: RefreshStats = { calls: 0, failures: 0, people: 0, rows: 0 };
  const call = async (path: string) => {
    stats.calls++;
    try { return await tmdbGet(path, tmdbKey); } catch (err) { stats.failures++; console.error(err); return null; }
  };

  const credits = await mapWithConcurrency(people, TMDB_CONCURRENCY, async (p) => {
    const body = await call(`/person/${p.id}/combined_credits`);
    return { person: p, ok: body !== null, candidates: body ? feedCandidates(body, today) : { films: [], shows: [] } };
  });

  const filmIds = [...new Set(credits.flatMap(c => c.candidates.films.map(f => f.tmdbId)))];
  const showIds = [...new Set(credits.flatMap(c => c.candidates.shows.map(s => s.tmdbId)))];
  const releases = new Map<number, Record<string, { kind: string; date: string }>>();
  await mapWithConcurrency(filmIds, TMDB_CONCURRENCY, async (id) => {
    const body = await call(`/movie/${id}/release_dates`);
    if (body) releases.set(id, regionalReleases(body));
  });
  const seasons = new Map<number, ReturnType<typeof showSeasons>>();
  await mapWithConcurrency(showIds, TMDB_CONCURRENCY, async (id) => {
    const body = await call(`/tv/${id}`);
    if (body) seasons.set(id, showSeasons(body, today));
  });
  // Weekly or a whole drop is only worth a season call around its premiere,
  // when the release-day alert is about to be written.
  const since = isoDay(now, PEOPLE_LOOK_BACK_DAYS);
  const drops = new Map<string, number>();
  const nearPremiere = [...seasons].flatMap(([id, list]) =>
    list.filter(s => s.date >= since && s.date <= isoDay(now, -1)).map(s => ({ id, s })));
  await mapWithConcurrency(nearPremiere, TMDB_CONCURRENCY, async ({ id, s }) => {
    const body = await call(`/tv/${id}/season/${s.season}`);
    if (body) drops.set(`${id}:${s.season}`, premiereDrop(body, s.date));
  });

  const stamp = now.toISOString();
  const rows: FeedRow[] = [];
  for (const { person, ok, candidates } of credits) {
    if (!ok) continue;
    stats.people++;
    for (const f of candidates.films) {
      rows.push({
        tmdb_person_id: person.id, media_type: 'movie', tmdb_id: f.tmdbId, season_number: 0, kind: 'film',
        person_name: person.name, person_role: f.role, character: f.character, title: f.title,
        poster_path: f.posterPath, release_date: f.primaryDate, regional_releases: (releases.get(f.tmdbId) ?? {}) as Json,
        updated_at: stamp,
      });
    }
    for (const sh of candidates.shows) {
      for (const s of seasons.get(sh.tmdbId) ?? []) {
        rows.push({
          tmdb_person_id: person.id, media_type: 'tv', tmdb_id: sh.tmdbId, season_number: s.season, kind: s.kind,
          person_name: person.name, person_role: sh.role, character: sh.character, title: sh.title,
          poster_path: sh.posterPath, release_date: s.date, network: s.network, episode_count: s.episodeCount,
          premiere_drop: drops.get(`${sh.tmdbId}:${s.season}`) ?? null, updated_at: stamp,
        });
      }
    }
  }

  stats.rows = rows.length;
  if (!write) return { rows, stats };
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await db.from('people_feed')
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: 'tmdb_person_id,media_type,tmdb_id,season_number' });
    if (error) throw new Error(`people_feed write failed: ${error.message}`);
  }
  // Only for people whose credits loaded: a TMDB failure must not empty a feed.
  const refreshed = credits.filter(c => c.ok).map(c => c.person.id);
  for (let i = 0; i < refreshed.length; i += ID_CHUNK) {
    const { error } = await db.from('people_feed').delete()
      .in('tmdb_person_id', refreshed.slice(i, i + ID_CHUNK))
      .lt('updated_at', stamp);
    if (error) throw new Error(`people_feed prune failed: ${error.message}`);
  }
  return { rows, stats };
}

/** Distinct titles (and seasons) dated today or later: the follow toast's count. */
export function upcomingCount(rows: FeedRow[], now: Date): number {
  const today = isoDay(now);
  const keys = new Set(rows
    .filter(r => (r.release_date ?? '') >= today)
    .map(r => `${r.media_type}:${r.tmdb_id}:${r.season_number ?? 0}`));
  return keys.size;
}
