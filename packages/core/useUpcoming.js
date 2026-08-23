import { useState, useEffect } from 'react';
import { tmdb } from './tmdb.js';
import { localDateStr, dateToLocalStr } from './date.js';

// "My Channels" (profile.guide_channels) are free/ad-supported broadcast
// providers, not subscription streaming — TMDB's default 'flatrate'
// monetization filter would silently exclude them, so widen it here.
const MONETIZATION_TYPES = 'free|ads';

// How far ahead the Upcoming feed looks. Beyond this TMDB's dates get
// speculative and the day-by-day grouping turns into a long tail of
// single-title days.
const HORIZON_MONTHS = 6;

/**
 * @typedef {{ id: number, media_type: 'movie' | 'tv', release_date?: string | null,
 *             first_air_date?: string | null, poster_path?: string | null,
 *             [key: string]: unknown }} UpcomingItem
 * @typedef {{ today: UpcomingItem[],
 *             upcomingGrouped: Record<string, UpcomingItem[]>,
 *             upcomingDates: string[] }} UpcomingData
 */

/**
 * Titles that are already out: a show first airing today, or a movie dated on
 * or before today. Adds each id to `seen` so later passes skip it.
 *
 * Pure and exported so these rules are unit-testable without a renderer.
 *
 * @param {{ movies?: any[], tv?: any[], todayStr: string, seen?: Set<number> }} input
 * @returns {any[]}
 */
export function pickOutNow({ movies = [], tv = [], todayStr, seen = new Set() }) {
  const today = [];

  for (const s of tv) {
    if (s.first_air_date === todayStr) {
      today.push({ ...s, media_type: 'tv', first_air_date: null });
      seen.add(s.id);
    }
  }
  // A movie dated on or before today is already in cinemas. This handles AU
  // theatrical releases that TMDB stores with a US primary_release_date in the
  // past while the regional date is now.
  for (const m of movies) {
    if (m.release_date <= todayStr) {
      today.push({ ...m, media_type: 'movie', release_date: null });
      seen.add(m.id);
    }
  }

  return today;
}

/**
 * Group everything after today, up to the horizon, by release date.
 *
 * `seen` is both read and written, so a caller that places some titles in
 * another rail first (Home's "recently released") can pass its own set and
 * keep those out of here. Split from pickOutNow for exactly that reason —
 * Home dedupes in three phases, not two.
 *
 * @param {{ movies?: any[], tv?: any[], todayStr: string, horizonStr: string, seen?: Set<number> }} input
 * @returns {{ upcomingGrouped: Record<string, any[]>, upcomingDates: string[] }}
 */
export function groupFuture({ movies = [], tv = [], todayStr, horizonStr, seen = new Set() }) {
  const upcomingGrouped = {};

  for (const movie of movies) {
    if (seen.has(movie.id)) continue;
    const d = movie.release_date;
    if (d && d > todayStr && d <= horizonStr) {
      (upcomingGrouped[d] ||= []).push({ ...movie, media_type: 'movie' });
      seen.add(movie.id);
    }
  }
  for (const show of tv) {
    if (seen.has(show.id)) continue;
    const d = show.first_air_date;
    if (d && d > todayStr && d <= horizonStr) {
      (upcomingGrouped[d] ||= []).push({ ...show, media_type: 'tv', first_air_date: null });
      seen.add(show.id);
    }
  }

  return { upcomingGrouped, upcomingDates: Object.keys(upcomingGrouped).sort() };
}

/**
 * The two halves composed, for callers with no third rail to interleave.
 *
 * @param {{ movies?: any[], tv?: any[], todayStr: string, horizonStr: string }} input
 * @returns {UpcomingData}
 */
export function groupUpcoming({ movies = [], tv = [], todayStr, horizonStr }) {
  const seen = new Set();
  const today = pickOutNow({ movies, tv, todayStr, seen });
  const { upcomingGrouped, upcomingDates } = groupFuture({ movies, tv, todayStr, horizonStr, seen });
  return { today, upcomingGrouped, upcomingDates };
}

/**
 * Upcoming releases for a set of watch providers, split into "today" and
 * day-by-day groups. Filtering (type/genre/kids) is deliberately left to the
 * caller — web and mobile apply it at render with the shared mediaFilters
 * helpers, so this stays a pure data hook.
 *
 * @param {{ providerIds?: number[] }} [options]
 * @returns {{ data: UpcomingData, loading: boolean }}
 */
export function useUpcoming({ providerIds = [] } = {}) {
  const [data, setData] = useState(
    /** @type {UpcomingData} */ ({ today: [], upcomingGrouped: {}, upcomingDates: [] }));
  const [loading, setLoading] = useState(true);

  const providerKey = providerIds.join(',');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      // Local date string, so UTC+ users (e.g. Australia) get their own "today"
      // rather than yesterday's UTC date.
      const todayStr = localDateStr();

      const [upcomingMovRes, upcomingTVRes] = await Promise.all([
        tmdb.getUpcoming(providerIds, MONETIZATION_TYPES),
        tmdb.getUpcomingTV(providerIds, MONETIZATION_TYPES),
      ]);
      if (cancelled) return;

      const horizonStr = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + HORIZON_MONTHS);
        return dateToLocalStr(d);
      })();

      if (cancelled) return;
      setData(groupUpcoming({
        movies: upcomingMovRes?.results || [],
        tv: upcomingTVRes?.results || [],
        todayStr,
        horizonStr,
      }));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [providerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
