import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { callAuthenticatedFunction } from './functions.js';
import { alertWriteError } from './usePremiumAlerts.js';
import { shiftDay } from './peopleFeed.js';

/**
 * The people someone follows (person_alerts), shared by every surface that
 * shows a Follow control: the title panel's cast and director, a person's
 * page, Home's Your people shelf, the Your people page and Settings. One
 * module-level store, so following someone in the panel updates the shelf
 * underneath it without a reload. Shared by web and mobile.
 *
 * Following is Premium. The insert policy calls is_premium(), so a Free
 * account (or a lapsed one) gets `premium_required` back and the caller opens
 * the upgrade sheet. Unfollowing always works.
 *
 * Person ids must come from a TMDB response (the credit or page being shown).
 * Name, headshot and department are a display cache.
 */

/** @typedef {{ tmdb_person_id: number, name: string, profile_path: string | null, known_for: string | null, created_at?: string }} Follow */

let store = /** @type {{ userId: string | null, follows: Follow[], loaded: boolean, feedVersion: number }} */ ({ userId: null, follows: [], loaded: false, feedVersion: 0 });
const subscribers = new Set();
let inflight = /** @type {Promise<void> | null} */ (null);

function setStore(next) {
  store = { ...store, ...next };
  subscribers.forEach(fn => fn(store));
}

async function load(userId) {
  if (inflight && store.userId === userId) return inflight;
  setStore({ userId, follows: [], loaded: false });
  inflight = (async () => {
    const { data } = await supabase.from('person_alerts')
      .select('tmdb_person_id, name, profile_path, known_for, created_at')
      .eq('user_id', userId)
      .order('name');
    if (store.userId === userId) setStore({ follows: data ?? [], loaded: true });
  })();
  try { await inflight; } finally { inflight = null; }
}

/** For tests and Storybook: seed the store without Supabase. @param {string | null} userId @param {Follow[]} follows */
export function _seedPeopleFollows(userId, follows) {
  setStore({ userId, follows, loaded: true });
}

/**
 * Ask the server to fill people_feed for someone just followed, so Your
 * people shows their work straight away. Resolves to the number of titles
 * (and seasons) dated today or later, or null when it could not tell.
 * @param {number} personId
 */
export async function refreshPersonFeed(personId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const result = await callAuthenticatedFunction('people-feed-refresh', session, { person_id: personId });
    return typeof result?.upcoming === 'number' ? result.upcoming : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} userId
 */
export function usePeopleFollows(userId) {
  const [snapshot, setSnapshot] = useState(store);

  useEffect(() => {
    subscribers.add(setSnapshot);
    return () => { subscribers.delete(setSnapshot); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (store.userId !== userId || (!store.loaded && !inflight)) load(userId);
  }, [userId]);

  const mine = snapshot.userId === userId && !!userId;
  const follows = useMemo(() => (mine ? snapshot.follows : []), [mine, snapshot.follows]);
  const ids = useMemo(() => new Set(follows.map(f => f.tmdb_person_id)), [follows]);

  /**
   * @param {{ id: number, name: string, profile_path?: string | null, known_for_department?: string | null }} person
   * @returns {Promise<{ ok: boolean, error: string | null, upcoming: number | null }>}
   */
  const follow = useCallback(async (person) => {
    if (!userId || !person?.id || !person?.name) return { ok: false, error: 'alert_failed', upcoming: null };
    const row = {
      tmdb_person_id: person.id,
      name: String(person.name).slice(0, 200),
      profile_path: person.profile_path ?? null,
      known_for: person.known_for_department ? String(person.known_for_department).slice(0, 60) : null,
    };
    const { error } = await supabase.from('person_alerts').insert({ user_id: userId, ...row });
    if (error && error.code !== '23505') return { ok: false, error: alertWriteError(error), upcoming: null };
    if (!store.follows.some(f => f.tmdb_person_id === person.id)) {
      setStore({ follows: [...store.follows, { ...row, created_at: new Date().toISOString() }].sort((a, b) => a.name.localeCompare(b.name)) });
    }
    const upcoming = await refreshPersonFeed(person.id);
    setStore({ feedVersion: (store.feedVersion ?? 0) + 1 });
    return { ok: true, error: null, upcoming };
  }, [userId]);

  const unfollow = useCallback(async (/** @type {number} */ personId) => {
    if (!userId) return false;
    const { error } = await supabase.from('person_alerts').delete().eq('user_id', userId).eq('tmdb_person_id', personId);
    if (error) return false;
    setStore({ follows: store.follows.filter(f => f.tmdb_person_id !== personId) });
    return true;
  }, [userId]);

  return {
    follows,
    loading: !!userId && !(mine && snapshot.loaded),
    isFollowing: (/** @type {number} */ id) => ids.has(id),
    follow,
    unfollow,
    feedVersion: snapshot.feedVersion ?? 0,
  };
}

/**
 * people_feed rows for the people someone follows, from OUT_NOW_DAYS ago on.
 * Re-reads when the follow list changes or a new follow's feed was refreshed.
 * @param {number[]} personIds
 * @param {{ today: string, version?: number }} opts
 */
export function usePeopleFeed(personIds, { today, version = 0 }) {
  const [state, setState] = useState(/** @type {{ key: string, rows: any[] }} */ ({ key: '', rows: [] }));
  const key = `${[...personIds].sort((a, b) => a - b).join(',')}|${today}|${version}`;
  useEffect(() => {
    if (!personIds.length) return;
    let active = true;
    supabase.from('people_feed').select('*')
      .in('tmdb_person_id', personIds.slice(0, 500))
      .gte('release_date', shiftDay(today, -60))
      .then(({ data }) => { if (active) setState({ key, rows: data ?? [] }); });
    return () => { active = false; };
    // personIds is captured through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!personIds.length) return { rows: [], loading: false };
  return { rows: state.key === key ? state.rows : [], loading: state.key !== key };
}
