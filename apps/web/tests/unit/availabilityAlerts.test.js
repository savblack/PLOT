import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERT_LOOK_BACK_DAYS, ANOMALY_MIN_SAMPLE, MIN_CONFIRM_HOURS,
  alertKind, alertsFor, arrivalKey, circuitBreaker, emptySnapshot, parseProviders, skipReason, stepSnapshot,
} from '../../../../supabase/functions/_shared/availabilityAlerts.js';
import { personReleaseKey } from '../../../../supabase/functions/_shared/premiumAlerts.js';

// The rules behind Premium "now streaming / now free" film alerts. The bar is
// that a false alert is worse than a late one, so most of these pin down what
// stays silent.
//
// Ids are negative or fictional on purpose: they are not TMDB ids (AGENTS.md:
// never guess one) and the rules only use them as keys. Providers are 9001+.

const DAY1 = '2026-10-04T22:15:00.000Z';
const DAY2 = '2026-10-05T22:15:00.000Z';
const DAY3 = '2026-10-06T22:15:00.000Z';

const A = { id: 9001, name: 'Service A' };
const B = { id: 9002, name: 'Service B' };
const FREE = { id: 9003, name: 'Free Service' };

const body = (region, buckets) => ({
  results: { [region]: Object.fromEntries(Object.entries(buckets).map(([b, ps]) => [b, ps.map(p => ({ provider_id: p.id, provider_name: p.name }))])) },
});
const observedOf = (buckets) => parseProviders(body('AU', buckets), 'AU').observed;

/** Run a sequence of snapshots, return every step. */
function run(steps) {
  let state = null;
  return steps.map(([at, buckets]) => {
    const step = stepSnapshot(state, observedOf(buckets), at);
    state = step.state;
    return step;
  });
}

test('parseProviders reads the tracked buckets for one region and ignores rent and buy', () => {
  const { usable, observed } = parseProviders({
    results: {
      AU: { flatrate: [{ provider_id: 9001, provider_name: 'Service A' }], rent: [{ provider_id: 9002, provider_name: 'Service B' }], buy: [{ provider_id: 9002, provider_name: 'Service B' }], ads: [{ provider_id: 9003, provider_name: 'Free Service' }] },
      US: { flatrate: [{ provider_id: 9009, provider_name: 'Other' }] },
    },
  }, 'AU');
  assert.equal(usable, true);
  assert.deepEqual(observed, { flatrate: { 9001: 'Service A' }, free: {}, ads: { 9003: 'Free Service' } });
});

test('parseProviders: a region with no entry is usable and empty, a broken body is not usable', () => {
  assert.deepEqual(parseProviders({ results: {} }, 'AU'), { usable: true, observed: { flatrate: {}, free: {}, ads: {} } });
  for (const broken of [null, undefined, {}, { results: null }, { results: 'x' }, [], 'nope', 0]) {
    assert.equal(parseProviders(broken, 'AU').usable, false);
  }
});

test('parseProviders drops entries it cannot trust and counts a duplicated provider once', () => {
  const { observed } = parseProviders({
    results: { AU: { flatrate: [
      { provider_id: 9001, provider_name: 'Service A' },
      { provider_id: 9001, provider_name: 'Service A again' },
      { provider_id: 0, provider_name: 'Zero' },
      { provider_id: -5, provider_name: 'Negative' },
      { provider_id: '9002', provider_name: 'String id' },
      { provider_id: 9004, provider_name: '   ' },
      { provider_id: 9005 },
      null,
    ] } },
  }, 'AU');
  assert.deepEqual(observed.flatrate, { 9001: 'Service A' });
});

test('the first snapshot is a baseline and tells nobody, whatever is already streaming', () => {
  const [first] = run([[DAY1, { flatrate: [A], free: [FREE] }]]);
  assert.equal(first.baseline, true);
  assert.deepEqual(first.events, []);
  assert.deepEqual(first.state.confirmed.flatrate, { 9001: 'Service A' });
  assert.deepEqual(first.state.confirmed.free, { 9003: 'Free Service' });
  assert.deepEqual(first.state.pending, {});
});

test('a provider seen for the first time is only pending: one sighting never alerts', () => {
  const [, second] = run([[DAY1, {}], [DAY2, { flatrate: [A] }]]);
  assert.deepEqual(second.events, []);
  assert.deepEqual(second.state.confirmed.flatrate, {});
  assert.deepEqual(second.state.pending, { 'flatrate:9001': { name: 'Service A', since: DAY2 } });
});

test('seen again at least MIN_CONFIRM_HOURS later, it is confirmed and becomes one event', () => {
  const steps = run([[DAY1, {}], [DAY2, { flatrate: [A] }], [DAY3, { flatrate: [A] }]]);
  assert.equal(steps[2].events.length, 1);
  assert.deepEqual(steps[2].events[0], { bucket: 'flatrate', providerId: 9001, name: 'Service A', firstSeenAt: DAY2, confirmedAt: DAY3 });
  assert.deepEqual(steps[2].state.confirmed.flatrate, { 9001: 'Service A' });
  assert.deepEqual(steps[2].state.pending, {});
  assert.equal(MIN_CONFIRM_HOURS, 20);
});

test('a second look inside the confirmation window neither confirms nor resets the clock', () => {
  const steps = run([[DAY1, {}], [DAY2, { flatrate: [A] }], ['2026-10-05T23:00:00.000Z', { flatrate: [A] }], [DAY3, { flatrate: [A] }]]);
  assert.deepEqual(steps[2].events, []);
  assert.equal(steps[2].state.pending['flatrate:9001'].since, DAY2);
  assert.equal(steps[3].events.length, 1);
});

test('a one-day glitch (there today, gone tomorrow) never alerts', () => {
  const steps = run([[DAY1, {}], [DAY2, { flatrate: [A] }], [DAY3, {}]]);
  assert.deepEqual(steps[2].events, []);
  assert.deepEqual(steps[2].state.pending, {});
});

test('a glitch that comes back later starts the confirmation again from scratch', () => {
  const steps = run([[DAY1, {}], [DAY2, { flatrate: [A] }], [DAY3, {}], ['2026-10-07T22:15:00.000Z', { flatrate: [A] }]]);
  assert.deepEqual(steps[3].events, []);
  assert.equal(steps[3].state.pending['flatrate:9001'].since, '2026-10-07T22:15:00.000Z');
});

test('a provider that is already confirmed never produces an event again', () => {
  const steps = run([[DAY1, { flatrate: [A] }], [DAY2, { flatrate: [A] }], [DAY3, { flatrate: [A] }]]);
  for (const step of steps) assert.deepEqual(step.events, []);
});

test('a confirmed provider missing once stays confirmed and is only dropped after a second absence', () => {
  const steps = run([[DAY1, { flatrate: [A, B] }], [DAY2, { flatrate: [B] }], [DAY3, { flatrate: [B] }]]);
  assert.deepEqual(steps[1].state.confirmed.flatrate, { 9001: 'Service A', 9002: 'Service B' });
  assert.deepEqual(steps[1].state.missing, { 'flatrate:9001': { since: DAY2 } });
  assert.deepEqual(steps[2].state.confirmed.flatrate, { 9002: 'Service B' });
  assert.deepEqual(steps[2].state.missing, {});
});

test('a provider that drops out and returns has its absence forgotten and fires nothing', () => {
  const steps = run([[DAY1, { flatrate: [A, B] }], [DAY2, { flatrate: [B] }], [DAY3, { flatrate: [A, B] }]]);
  assert.deepEqual(steps[2].events, []);
  assert.deepEqual(steps[2].state.missing, {});
  assert.deepEqual(steps[2].state.confirmed.flatrate, { 9001: 'Service A', 9002: 'Service B' });
});

test('a provider confirmed, dropped and re-added still yields a candidate; the ledger is what stops the repeat', () => {
  // Dropped after two absences, then seen twice again: stepSnapshot reports it
  // (it cannot know the ledger), and the unique ledger row makes it a no-op.
  const steps = run([
    [DAY1, { flatrate: [A, B] }], [DAY2, { flatrate: [B] }], [DAY3, { flatrate: [B] }],
    ['2026-10-07T22:15:00.000Z', { flatrate: [A, B] }], ['2026-10-08T22:15:00.000Z', { flatrate: [A, B] }],
  ]);
  assert.equal(steps[4].events.length, 1);
  assert.equal(steps[4].events[0].providerId, 9001);
});

test('a film that had providers and now shows none anywhere is suspect: state is untouched and nothing fires', () => {
  const steps = run([[DAY1, { flatrate: [A] }], [DAY2, {}]]);
  assert.equal(steps[1].suspect, true);
  assert.deepEqual(steps[1].events, []);
  assert.deepEqual(steps[1].state, steps[0].state);
});

test('a film that never had providers is not suspect when it shows none', () => {
  const steps = run([[DAY1, {}], [DAY2, {}]]);
  assert.equal(steps[1].suspect, false);
});

test('a new provider in a different bucket is tracked on its own', () => {
  const steps = run([[DAY1, { flatrate: [A] }], [DAY2, { flatrate: [A], ads: [A] }], [DAY3, { flatrate: [A], ads: [A] }]]);
  assert.equal(steps[2].events.length, 1);
  assert.equal(steps[2].events[0].bucket, 'ads');
});

test('emptySnapshot is a fresh object each time', () => {
  const a = emptySnapshot();
  a.confirmed.flatrate[1] = 'x';
  assert.deepEqual(emptySnapshot().confirmed.flatrate, {});
});

test('stepSnapshot does not mutate the previous state', () => {
  const [first] = run([[DAY1, { flatrate: [A] }]]);
  const before = JSON.stringify(first.state);
  stepSnapshot(first.state, observedOf({ flatrate: [A, B] }), DAY2);
  assert.equal(JSON.stringify(first.state), before);
});

test('circuitBreaker trips on a high failure rate and on a flood of changes, and stays quiet otherwise', () => {
  assert.deepEqual(circuitBreaker({ checked: 10, failures: 6, newEvents: 0, suspects: 0 }), { tripped: true, reason: 'failures' });
  assert.deepEqual(circuitBreaker({ checked: 10, failures: 5, newEvents: 0, suspects: 0 }), { tripped: false, reason: null });
  assert.deepEqual(circuitBreaker({ checked: 100, failures: 0, newEvents: 8, suspects: 4 }), { tripped: true, reason: 'anomaly' });
  assert.deepEqual(circuitBreaker({ checked: 100, failures: 0, newEvents: 6, suspects: 4 }), { tripped: false, reason: null });
  // Too few films to judge a rate: one event in ten films is not an anomaly.
  assert.equal(ANOMALY_MIN_SAMPLE, 25);
  assert.deepEqual(circuitBreaker({ checked: 10, failures: 0, newEvents: 5, suspects: 0 }), { tripped: false, reason: null });
  assert.deepEqual(circuitBreaker({ checked: 0, failures: 0, newEvents: 0, suspects: 0 }), { tripped: false, reason: null });
});

test('alertKind: only subscription is "streaming"', () => {
  assert.equal(alertKind('flatrate'), 'streaming');
  assert.equal(alertKind('free'), 'free');
  assert.equal(alertKind('ads'), 'free');
});

test('arrivalKey is its own namespace, never the Free movie_release key', () => {
  assert.equal(arrivalKey(-10, 'AU', 'streaming'), 'streaming_arrival:movie:-10:AU:streaming');
  assert.notEqual(arrivalKey(-10, 'AU', 'streaming'), personReleaseKey('movie', -10));
  assert.notEqual(arrivalKey(-10, 'AU', 'streaming'), arrivalKey(-10, 'AU', 'free'));
  assert.notEqual(arrivalKey(-10, 'AU', 'streaming'), arrivalKey(-10, 'US', 'streaming'));
});

const event = (over = {}) => ({ bucket: 'flatrate', providerId: 9001, name: 'Service A', firstSeenAt: DAY2, confirmedAt: DAY3, ...over });
const person = (over = {}) => ({ serviceIds: [9001], optedInAt: '2026-10-01T00:00:00.000Z', watched: false, ...over });

test('skipReason: watched, opted in after it showed up, and stale are silent', () => {
  assert.equal(skipReason(person(), event(), DAY3), null);
  assert.equal(skipReason(person({ watched: true }), event(), DAY3), 'watched');
  // Provider was already showing when they turned the alert on.
  assert.equal(skipReason(person({ optedInAt: '2026-10-05T23:00:00.000Z' }), event(), DAY3), 'before_opt_in');
  // Opted in between first sighting and confirmation is still after first sighting: not an echo.
  assert.equal(skipReason(person({ optedInAt: DAY2 }), event(), DAY3), null);
  assert.equal(skipReason(person(), event({ confirmedAt: '2026-09-27T00:00:00.000Z' }), '2026-10-06T00:00:00.000Z'), 'stale');
  assert.equal(ALERT_LOOK_BACK_DAYS, 7);
  // An unknown opt-in time never silently drops the alert.
  assert.equal(skipReason(person({ optedInAt: null }), event(), DAY3), null);
});

test('alertsFor: a subscription arrival only counts on one of their own services', () => {
  assert.deepEqual(alertsFor(person(), [event()], DAY3).alerts, [{ kind: 'streaming', providerName: 'Service A', date: '2026-10-06' }]);
  assert.deepEqual(alertsFor(person({ serviceIds: [9002] }), [event()], DAY3).alerts, []);
  assert.deepEqual(alertsFor(person({ serviceIds: [] }), [event()], DAY3).alerts, []);
});

test('alertsFor: a free or ad-supported arrival counts on any service, with or without selected services', () => {
  for (const bucket of ['free', 'ads']) {
    const free = event({ bucket, providerId: 9003, name: 'Free Service' });
    assert.deepEqual(alertsFor(person({ serviceIds: [] }), [free], DAY3).alerts, [{ kind: 'free', providerName: 'Free Service', date: '2026-10-06' }]);
    assert.equal(alertsFor(person(), [free], DAY3).alerts.length, 1);
  }
});

test('alertsFor: several providers arriving together collapse to one alert per kind, naming the lowest id', () => {
  const events = [
    event({ providerId: 9002, name: 'Service B' }),
    event({ providerId: 9001, name: 'Service A' }),
    event({ bucket: 'ads', providerId: 9004, name: 'Ads Four' }),
    event({ bucket: 'free', providerId: 9003, name: 'Free Service' }),
  ];
  const { alerts } = alertsFor(person({ serviceIds: [9001, 9002] }), events, DAY3);
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts.find(a => a.kind === 'streaming'), { kind: 'streaming', providerName: 'Service A', date: '2026-10-06' });
  assert.deepEqual(alerts.find(a => a.kind === 'free'), { kind: 'free', providerName: 'Free Service', date: '2026-10-06' });
});

test('alertsFor counts why it stayed silent, and watched people get nothing', () => {
  const { alerts, skipped } = alertsFor(person({ watched: true }), [event(), event({ bucket: 'free', providerId: 9003, name: 'Free Service' })], DAY3);
  assert.deepEqual(alerts, []);
  assert.deepEqual(skipped, { stale: 0, before_opt_in: 0, watched: 2 });
});

test('end to end: baseline, glitch, then a real arrival confirmed on the next run', () => {
  const steps = run([
    [DAY1, { flatrate: [B] }],
    [DAY2, { flatrate: [A, B] }],
    [DAY3, { flatrate: [A, B] }],
  ]);
  const events = steps.flatMap(s => s.events);
  assert.equal(events.length, 1);
  const { alerts } = alertsFor(person(), events, DAY3);
  assert.deepEqual(alerts.map(a => a.providerName), ['Service A']);
});
