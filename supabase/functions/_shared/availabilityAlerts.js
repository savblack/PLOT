// Rules for the Premium "now streaming / now free" film alerts
// (supabase/functions/streaming-arrival-alerts).
//
// Pure functions, so the rules that decide whether someone is told are tested
// with node --test (apps/web/tests/unit/availabilityAlerts.test.js) without
// Deno, a database or TMDB. The bar is the same as every other alert here: a
// false alert is worse than a late one, so anything these cannot establish from
// the data means "say nothing this run".
//
// TMDB's watch/providers (JustWatch data) is a snapshot with no history. It
// lags, and it flaps: a provider can vanish for a day and come back. So the
// job keeps its own state per film and region and only believes a change once
// it has held across two snapshots:
//
//   baseline  the first snapshot of a film+region records what is there and
//             tells nobody. Everything already streaming is not "new".
//   pending   a provider seen for the first time. Not believed yet.
//   confirmed a provider that was still there at least MIN_CONFIRM_HOURS later.
//             This is the event that can become an alert.
//   missing   a confirmed provider that was absent once. It is only dropped
//             after a second absence, so a one-day gap never churns state.
//
// Which providers count: subscription (flatrate), free and free-with-ads.
// Rent and buy do not, because a film coming out to rent is the Free
// movie_release alert's job and "now streaming" means with what you pay for.

/** Buckets tracked, as TMDB names them. */
export const TRACKED_BUCKETS = /** @type {const} */ (['flatrate', 'free', 'ads']);

/** Hours a new provider must keep showing before it is believed. The job runs daily, so this is "the next run". */
export const MIN_CONFIRM_HOURS = 20;
const MIN_CONFIRM_MS = MIN_CONFIRM_HOURS * 3600 * 1000;

/** How far back a confirmed event still counts. Lets a failed write heal on later runs. */
export const ALERT_LOOK_BACK_DAYS = 7;

/** Above this share of failed TMDB calls the run is not trusted. Same as the other jobs. */
export const MAX_FAILURE_RATE = 0.5;
/** Share of checked films showing a new provider or a total wipe-out that means "bad upstream data", not "good week". */
export const MAX_ANOMALY_RATE = 0.1;
/** Below this many films the anomaly rate is too noisy to judge; only the failure rate applies. */
export const ANOMALY_MIN_SAMPLE = 25;

/**
 * @typedef {{ [providerId: string]: string }} ProviderMap provider id → name
 * @typedef {{ flatrate: ProviderMap, free: ProviderMap, ads: ProviderMap }} Buckets
 * @typedef {{
 *   confirmed: Buckets,
 *   pending: { [bucketAndId: string]: { name: string, since: string } },
 *   missing: { [bucketAndId: string]: { since: string } },
 * }} Snapshot
 * @typedef {{ bucket: 'flatrate' | 'free' | 'ads', providerId: number, name: string, firstSeenAt: string, confirmedAt: string }} ArrivalEvent
 */

/** @returns {Buckets} */
const emptyBuckets = () => ({ flatrate: {}, free: {}, ads: {} });

/** @returns {Snapshot} */
export const emptySnapshot = () => ({ confirmed: emptyBuckets(), pending: {}, missing: {} });

const slot = (/** @type {string} */ bucket, /** @type {string | number} */ id) => `${bucket}:${id}`;

/** @param {Buckets} buckets */
const countProviders = (buckets) => TRACKED_BUCKETS.reduce((n, b) => n + Object.keys(buckets[b]).length, 0);

/**
 * One region of a /movie/{id}/watch/providers body, reduced to the tracked
 * buckets. `usable` is false when the body is not a providers response at all
 * (so the caller leaves state alone). A body that is fine but has no entry for
 * the region is usable and empty: the film is simply not available there.
 *
 * A provider listed twice in one bucket is counted once; a provider in two
 * buckets (subscription and free-with-ads) is kept in both.
 *
 * @param {any} body
 * @param {string} region ISO 3166-1
 * @returns {{ usable: boolean, observed: Buckets }}
 */
export function parseProviders(body, region) {
  const observed = emptyBuckets();
  if (!body || typeof body !== 'object' || typeof body.results !== 'object' || body.results === null) {
    return { usable: false, observed };
  }
  const entry = body.results[region];
  for (const bucket of TRACKED_BUCKETS) {
    for (const p of entry?.[bucket] ?? []) {
      if (!Number.isInteger(p?.provider_id) || p.provider_id <= 0) continue;
      if (typeof p.provider_name !== 'string' || !p.provider_name.trim()) continue;
      observed[bucket][String(p.provider_id)] ??= p.provider_name;
    }
  }
  return { usable: true, observed };
}

/**
 * Advance one film+region by one snapshot.
 *
 * `prev` is null for a film+region never seen: that is the baseline, which
 * records and tells nobody. `suspect` means a film that had providers now shows
 * none anywhere, which is far more often an upstream glitch than a film pulled
 * from every service; state is returned untouched and nothing is emitted.
 *
 * The events returned are candidates. The caller records them in the ledger
 * (a unique row per film, region, provider and bucket), and a provider that
 * flapped out and back finds its ledger row already there and tells nobody.
 *
 * @param {Snapshot | null} prev
 * @param {Buckets} observed
 * @param {string} nowIso
 * @returns {{ state: Snapshot, events: ArrivalEvent[], baseline: boolean, suspect: boolean }}
 */
export function stepSnapshot(prev, observed, nowIso) {
  if (!prev) {
    return { state: { confirmed: structuredClone(observed), pending: {}, missing: {} }, events: [], baseline: true, suspect: false };
  }
  if (countProviders(prev.confirmed) > 0 && countProviders(observed) === 0) {
    return { state: prev, events: [], baseline: false, suspect: true };
  }

  const now = Date.parse(nowIso);
  const state = structuredClone(prev);
  /** @type {ArrivalEvent[]} */
  const events = [];

  for (const bucket of TRACKED_BUCKETS) {
    for (const [id, name] of Object.entries(observed[bucket])) {
      const k = slot(bucket, id);
      delete state.missing[k];
      if (state.confirmed[bucket][id]) {
        delete state.pending[k];
        continue;
      }
      const seen = state.pending[k];
      if (!seen) {
        state.pending[k] = { name, since: nowIso };
      } else if (now - Date.parse(seen.since) >= MIN_CONFIRM_MS) {
        state.confirmed[bucket][id] = name;
        delete state.pending[k];
        events.push({ bucket, providerId: Number(id), name, firstSeenAt: seen.since, confirmedAt: nowIso });
      }
      // else seen too recently to believe: leave `since` alone so it is not reset.
    }

    for (const id of Object.keys(state.confirmed[bucket])) {
      if (observed[bucket][id]) continue;
      const k = slot(bucket, id);
      const gone = state.missing[k];
      if (!gone) state.missing[k] = { since: nowIso };
      else if (now - Date.parse(gone.since) >= MIN_CONFIRM_MS) {
        delete state.confirmed[bucket][id];
        delete state.missing[k];
      }
    }
  }

  // A pending provider that is not in this snapshot was a glitch.
  for (const k of Object.keys(state.pending)) {
    const [bucket, id] = k.split(':');
    if (!observed[/** @type {'flatrate' | 'free' | 'ads'} */ (bucket)]?.[id]) delete state.pending[k];
  }

  return { state, events, baseline: false, suspect: false };
}

/**
 * Whether the whole run should be trusted. A tripped run writes nothing: no
 * state, no ledger rows, no notifications. It is reported ok:false so it shows
 * in the cron log, and a person can inspect it with dry_run and then re-run
 * with force_breaker once they are satisfied the change is real.
 *
 * @param {{ checked: number, failures: number, newEvents: number, suspects: number }} stats
 * @returns {{ tripped: boolean, reason: 'failures' | 'anomaly' | null }}
 */
export function circuitBreaker({ checked, failures, newEvents, suspects }) {
  if (checked > 0 && failures / checked > MAX_FAILURE_RATE) return { tripped: true, reason: 'failures' };
  if (checked >= ANOMALY_MIN_SAMPLE && (newEvents + suspects) / checked > MAX_ANOMALY_RATE) {
    return { tripped: true, reason: 'anomaly' };
  }
  return { tripped: false, reason: null };
}

// ── Who is told ───────────────────────────────────────────────────────────────

/** @param {'flatrate' | 'free' | 'ads'} bucket @returns {'streaming' | 'free'} */
export const alertKind = (bucket) => (bucket === 'flatrate' ? 'streaming' : 'free');

/**
 * One alert per person per film per region per kind, ever, however many
 * providers arrive. Its own namespace: it must not collide with
 * person_release:movie:<id>, which the Free movie_release row uses.
 *
 * @param {number} tmdbId @param {string} region @param {'streaming' | 'free'} kind
 */
export const arrivalKey = (tmdbId, region, kind) => `streaming_arrival:movie:${tmdbId}:${region}:${kind}`;

/**
 * Why a person who opted in is not told about an event, or null if they are.
 *
 *   stale          the event was confirmed more than ALERT_LOOK_BACK_DAYS ago.
 *   before_opt_in  the provider was already showing when they turned the alert
 *                  on, so "now" would be an echo of what they could see.
 *   watched        they have already logged watching it.
 *
 * @param {{ optedInAt: string | null, watched: boolean }} person
 * @param {ArrivalEvent} event
 * @param {string} nowIso
 * @returns {'stale' | 'before_opt_in' | 'watched' | null}
 */
export function skipReason({ optedInAt, watched }, event, nowIso) {
  if (Date.parse(nowIso) - Date.parse(event.confirmedAt) > ALERT_LOOK_BACK_DAYS * 86400000) return 'stale';
  // A missing opt-in time means "unknown, so assume it was long ago": never silently drop.
  if (optedInAt && Date.parse(event.firstSeenAt) < Date.parse(optedInAt)) return 'before_opt_in';
  if (watched) return 'watched';
  return null;
}

/**
 * The alerts one person gets for one film in their region, from its recent
 * confirmed events. At most one per kind:
 *
 *   streaming  a subscription provider that is one of their own services.
 *   free       any free or free-with-ads provider, whichever service it is on.
 *
 * With no services selected the streaming alert cannot be established, so only
 * the free one is possible. The named provider is the lowest id among the
 * matches, so the same data always names the same service.
 *
 * @param {{ serviceIds: number[], optedInAt: string | null, watched: boolean }} person
 * @param {ArrivalEvent[]} events confirmed events for this film and region
 * @param {string} nowIso
 * @returns {{ alerts: { kind: 'streaming' | 'free', providerName: string, date: string }[], skipped: { stale: number, before_opt_in: number, watched: number } }}
 */
export function alertsFor(person, events, nowIso) {
  const mine = new Set(person.serviceIds);
  const skipped = { stale: 0, before_opt_in: 0, watched: 0 };
  /** @type {Map<'streaming' | 'free', ArrivalEvent>} */
  const best = new Map();
  for (const event of events) {
    const kind = alertKind(event.bucket);
    if (kind === 'streaming' && !mine.has(event.providerId)) continue;
    const reason = skipReason(person, event, nowIso);
    if (reason) { skipped[reason]++; continue; }
    const current = best.get(kind);
    if (!current || event.providerId < current.providerId) best.set(kind, event);
  }
  const alerts = [...best].map(([kind, e]) => ({ kind, providerName: e.name, date: e.confirmedAt.slice(0, 10) }));
  return { alerts, skipped };
}
