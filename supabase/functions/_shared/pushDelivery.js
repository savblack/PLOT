// Pure push rules. The in-app notification is the source of truth; this module
// only decides whether and how its Premium delivery channel is used.

export const PUSH_TYPES = Object.freeze(['new_episode', 'movie_release', 'streaming_arrival']);
export const PUSH_LOOK_BACK_DAYS = 2;
export const PUSH_MAX_ATTEMPTS = 3;
export const PUSH_LEASE_MS = 10 * 60 * 1000;

/** @param {{ push_enabled: boolean, push_enabled_at: string | null, streaming_alerts: boolean }} prefs
 *  @param {{ type: string, created_at: string }} notification
 *  @param {boolean} premium */
export function pushBlocked(prefs, notification, premium) {
  if (!premium || !prefs.push_enabled || !prefs.push_enabled_at) return 'not_enabled';
  if (notification.created_at < prefs.push_enabled_at) return 'before_opt_in';
  if (notification.type === 'streaming_arrival' && !prefs.streaming_alerts) return 'streaming_off';
  return null;
}

/** @param {{ status: string, attempts: number, claimed_at: string | null } | null} delivery
 *  @param {number} now */
export function pushAction(delivery, now) {
  if (!delivery) return 'claim';
  if (delivery.status === 'sent' || delivery.status === 'disabled' || delivery.attempts >= PUSH_MAX_ATTEMPTS) return null;
  if (delivery.status === 'failed') return 'retry';
  if (delivery.status === 'pending' && (!delivery.claimed_at || now - Date.parse(delivery.claimed_at) >= PUSH_LEASE_MS)) return 'reclaim';
  return null;
}

/** @param {unknown} value */
const oneLine = (value) => Array.from(String(value ?? ''), c => {
  const code = c.charCodeAt(0);
  return code < 32 || code === 127 ? ' ' : c;
}).join('').replace(/\s+/g, ' ').trim();

/** @param {{ type: string, media_title: string | null, season_number: number | null,
 * episode_number: number | null, episode_count: number | null, release_kind: string | null,
 * provider_name: string | null, tmdb_id: number | null, media_type: string | null,
 * id: string, user_id: string }} n */
export function pushMessage(n) {
  const title = oneLine(n.media_title) || (n.type === 'new_episode' ? 'A show you follow' : 'A film on your list');
  let body;
  if (n.type === 'new_episode') {
    const season = n.season_number ?? 0;
    const episode = n.episode_number ?? 0;
    const count = n.episode_count ?? 1;
    body = count > 1
      ? (episode === 1 ? `Season ${season} is out, ${count} episodes` : `S${season} E${episode} to E${episode + count - 1} are out`)
      : (episode === 1 ? `Season ${season} premiere is out` : `S${season} E${episode} is out`);
  } else if (n.type === 'movie_release') {
    body = n.release_kind === 'digital' ? 'Out to watch at home now' : 'In cinemas now';
  } else {
    const provider = oneLine(n.provider_name);
    body = n.release_kind === 'free'
      ? (provider ? `Free to watch on ${provider} now` : 'Free to watch now')
      : (provider ? `Streaming on ${provider} now` : 'Streaming now');
  }
  return {
    title: title.slice(0, 100),
    body: body.slice(0, 180),
    data: { notificationId: n.id, tmdbId: n.tmdb_id, mediaType: n.media_type, userId: n.user_id },
  };
}
