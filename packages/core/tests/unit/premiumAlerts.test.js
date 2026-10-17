import test from 'node:test';
import assert from 'node:assert/strict';
import { alertPhrase, alertBadge, ALERT_NOTIFICATIONS, notificationPhrase } from '../../copy/notifications.js';
import { isAlertNotification, notificationKind, groupNotifications } from '../../notificationGroups.js';
import { alertWriteError } from '../../usePremiumAlerts.js';
import { upgradeSheetContent } from '../../upgradeSheet.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

// tmdb_id 0 is deliberately not a real TMDB id (AGENTS.md: never guess one).
const release = (extra = {}) => ({ id: 'a', type: 'person_release', created_at: '2026-09-28T08:00:00Z', tmdb_id: 0, media_type: 'movie', media_title: 'Harbour Lights', person_name: 'Ada Quill', person_role: 'cast', release_kind: 'theatrical', ...extra });
const season = (extra = {}) => ({ id: 'b', type: 'season_ready', created_at: '2026-09-28T08:00:00Z', tmdb_id: 0, media_type: 'tv', media_title: 'The Night Desk', season_number: 2, provider_name: 'Service One', ...extra });

test('alert rows read "<title><tail>" as on the round 2 Notifications board', () => {
  const line = (n) => `${n.media_title}${alertPhrase(n)}`;
  assert.equal(line(release()), 'Harbour Lights with Ada Quill is in cinemas today');
  assert.equal(line(release({ person_role: 'director' })), 'Harbour Lights, directed by Ada Quill, is in cinemas today');
  assert.equal(line(release({ release_kind: 'digital' })), 'Harbour Lights with Ada Quill is out to watch at home today');
  assert.equal(line(release({ media_type: 'tv', media_title: 'East Pier', release_kind: 'premiere', provider_name: 'Service One' })), 'East Pier with Ada Quill is on Service One today');
  assert.equal(line(release({ media_type: 'tv', media_title: 'East Pier', release_kind: 'premiere', person_role: 'creator' })), 'East Pier, created by Ada Quill, premieres today');
  assert.equal(line(release({ media_type: 'tv', media_title: 'Slow Lane', release_kind: 'season', season_number: 6, provider_name: 'Service Two', episode_count: 1 })),
    'Slow Lane season 6 with Ada Quill starts today on Service Two. New episodes weekly.');
  assert.equal(line(release({ media_type: 'tv', media_title: 'Slow Lane', release_kind: 'season', season_number: 4, provider_name: 'Service Two', episode_count: 8 })),
    'Slow Lane season 4 with Ada Quill starts today on Service Two. All 8 episodes are out.');
  assert.equal(line(season()), 'The Night Desk season 2 is ready: every episode is on Service One');
  assert.equal(alertPhrase(season({ provider_name: null })), null);
  assert.equal(alertPhrase({ type: 'new_follower' }), null);
});

test('alert badges name the kind of release and the person', () => {
  assert.equal(alertBadge(release()), 'New film · Ada Quill');
  assert.equal(alertBadge(release({ release_kind: 'premiere' })), 'New series · Ada Quill');
  assert.equal(alertBadge(release({ release_kind: 'season' })), 'New season · Ada Quill');
  assert.equal(alertBadge(season()), 'Whole season ready');
});

test('no alert copy uses an em dash', () => {
  const blob = JSON.stringify(ALERT_NOTIFICATIONS) + alertPhrase(release()) + alertPhrase(season());
  assert.doesNotMatch(blob, /—/);
});

test('alert rows are title rows, kept in the day groups, and never social', () => {
  assert.equal(isAlertNotification(release()), true);
  assert.equal(isAlertNotification(season()), true);
  assert.equal(isAlertNotification({ ...season(), tmdb_id: null }), false);
  assert.equal(isAlertNotification({ id: 'c', type: 'new_follower', created_at: '2026-09-28T08:00:00Z' }), false);
  // Episode notifications are a separate Free feature, not a Premium alert.
  assert.equal(isAlertNotification({ ...season(), type: 'new_episode' }), false);
  assert.equal(notificationKind('person_release'), 'activity');
  const { rollup, groups } = groupNotifications([release(), season()], Date.parse('2026-09-28T10:00:00Z'));
  assert.equal(rollup, null);
  assert.deepEqual(groups.map(g => g.items.map(n => n.id)), [['a', 'b']]);
  // The social phrasing never applies to an alert row.
  assert.equal(notificationPhrase('person_release'), 'interacted with you');
});

test('an RLS refusal on an opt-in insert means Premium is required', () => {
  assert.equal(alertWriteError(null), null);
  assert.equal(alertWriteError({ code: '42501', message: 'new row violates row-level security policy for table "person_alerts"' }), 'premium_required');
  assert.equal(alertWriteError({ message: 'new row violates row-level security policy' }), 'premium_required');
  assert.equal(alertWriteError({ code: '08006', message: 'connection failure' }), 'connection failure');
  assert.equal(alertWriteError({}), 'alert_failed');
});

test('the alerts upgrade sheet leads with alerts and has no Free cap meter', () => {
  const content = upgradeSheetContent('alerts');
  assert.equal(content.meter, 0);
  assert.equal(content.context, 'Following people is part of Premium');
  assert.equal(content.title, 'Follow the people you love watching.');
  assert.equal(content.body, 'Hear when they have something new.');
  assert.doesNotMatch(content.body + content.title, /season/i);
  assert.deepEqual(content.also.map(r => r.label), ['Pick for Me', 'Find something you both want']);
});

test('people and season-ready alerts are live Premium features; episode alerts are live on Free', () => {
  for (const id of ['peopleAlerts', 'seasonReady']) {
    assert.equal(PLANS_PAGE.premiumFeatures.find(f => f.id === id).live, true, id);
  }
  assert.equal(PLANS_PAGE.freeFeatures.find(f => f.id === 'episodeAlerts').planned, undefined);
  assert.equal(PLANS_PAGE.freeFeatures.find(f => f.id === 'releaseAlerts'), undefined);
  const faq = PLANS_PAGE.faqs.find(item => item.q === 'Are these alerts available now?').a;
  // The alerts answer covers what is live; Free's plans are in 'What happens to Free?'.
  assert.doesNotMatch(faq, /planned for Free and are not available yet/);
  assert.match(faq, /whole-season-ready alerts are available with plot Premium/);
  assert.doesNotMatch(faq, /People alerts.*still planned/);
});

test('streaming alerts on the watchlist are a live Free feature; push is Free and email is Premium, neither built yet', () => {
  const rows = PLANS_PAGE.comparison.groups.flatMap(g => g.rows);
  const inApp = rows.find(r => r.label === 'Streaming alerts for your watchlist');
  assert.deepEqual([inApp.free, inApp.premium, inApp.tag], [true, true, 'In the app']);
  const push = rows.find(r => r.label === 'Push notifications');
  assert.deepEqual([push.free, push.premium, push.tag], [true, true, undefined]);
  const email = rows.find(r => r.label === 'Email alerts');
  assert.deepEqual([email.free, email.premium, email.tag], [false, true, undefined]);
  assert.equal(rows.some(r => r.label === 'Push and email alerts'), false);
  // Email is not built: never listed as live. Push is no longer a Premium feature.
  const feature = PLANS_PAGE.premiumFeatures.find(f => f.id === 'emailAlerts');
  assert.ok(feature);
  assert.notEqual(feature.live, true);
  assert.equal(PLANS_PAGE.premiumFeatures.some(f => f.id === 'pushAlerts'), false);
  assert.equal(PLANS_PAGE.upgradeSheet.reasons.pushAlerts, undefined);
  // Live, so it is on Free's feature list (mobile Settings prints every label) and says "in the app".
  const free = PLANS_PAGE.freeFeatures.find(f => f.id === 'streamingAlerts');
  assert.ok(free);
  assert.notEqual(free.planned, true);
  assert.match(free.description, /in the app/);
  assert.doesNotMatch(free.label + free.description, /\b(push|email)\b/i);
  const faq = PLANS_PAGE.faqs.find(item => item.q === 'Are these alerts available now?').a;
  assert.match(faq, /Streaming alerts for films on your watchlist are free and arrive in the app/);
  // The old Premium-only framing is gone.
  assert.equal(PLANS_PAGE.premiumFeatures.find(f => f.id === 'streamingAlerts'), undefined);
  assert.equal(rows.some(r => r.label === 'Streaming alerts for films you pick'), false);
});
