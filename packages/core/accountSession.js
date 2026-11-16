import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Mirrors the SQL rule for local tests; the database makes the atomic decision.
 * @param {string | Date | null | undefined} lastSessionAt
 * @param {string | Date} now
 * @param {string} [timezone]
 */
export function shouldStartAccountSession(lastSessionAt, now, timezone = 'UTC') {
  if (!lastSessionAt) return true;
  const last = new Date(lastSessionAt);
  const current = new Date(now);
  if (!Number.isFinite(last.getTime()) || !Number.isFinite(current.getTime())) return false;
  if (current.getTime() - last.getTime() >= 30 * 60 * 1000) return true;
  let zone = timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'UTC'; }
  const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  return day(last) !== day(current);
}

/**
 * The database serializes this per profile. A qualifying signed-in open sets
 * session 1 when there is no last open, or increments after 30 minutes or a
 * different calendar date in the viewer's local timezone (UTC fallback).
 * Mere remounts and tab switches within that window keep the same count.
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} timezone
 * @param {{ client?: any }} [options]
 * @returns {Promise<number | null>}
 */
export async function recordAccountSession(userId, timezone, { client = supabase } = {}) {
  if (!userId) return null;
  try {
    let localTimezone = 'UTC';
    try { localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* unknown timezone */ }
    const { data, error } = await client.rpc('record_account_session', { p_timezone: timezone || localTimezone });
    if (error) return null;
    return Number.isInteger(data) && data >= 1 ? data : null;
  } catch { return null; }
}

/**
 * The active edge is supplied by each platform's visible/foreground shell.
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} timezone
 * @param {boolean} active
 */
export function useAccountSession(userId, timezone, active) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!userId || !active) return undefined;
    let live = true;
    void recordAccountSession(userId, timezone).then(count => {
      if (live) setResult({ userId, count });
    });
    return () => { live = false; };
  }, [userId, timezone, active]);
  return result?.userId === userId ? result.count : null;
}
