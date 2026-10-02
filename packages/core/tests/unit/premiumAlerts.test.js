import test from 'node:test';
import assert from 'node:assert/strict';
import { alertPhrase, ALERT_NOTIFICATIONS, notificationPhrase } from '../../copy/notifications.js';
import { isAlertNotification, notificationKind, groupNotifications } from '../../notificationGroups.js';
import { alertWriteError } from '../../usePremiumAlerts.js';
import { upgradeSheetContent } from '../../upgradeSheet.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

// tmdb_id 0 is deliberately not a real TMDB id (AGENTS.md: never guess one).
const release = (extra = {}) => ({ id: 'a', type: 'person_release', created_at: '2026-09-28T08:00:00Z', tmdb_id: 0, media_type: 'movie', media_title: 'Harbour Lights', person_name: 'Ada Quill', person_role: 'cast', release_kind: 'theatrical', ...extra });
const season = (extra = {}) => ({ id: 'b', type: 'season_ready', created_at: '2026-09-28T08:00:00Z', tmdb_id: 0, media_type: 'tv', media_title: 'The Night Desk', season_number: 2, provider_name: 'Service One', ...extra });

test('alert rows read "<title> <phrase>" for each role and release kind', () => {
  assert.equal(alertPhrase(release()), 'with Ada Quill is in cinemas');
  assert.equal(alertPhrase(release({ person_role: 'director', release_kind: 'digital' })), 'from director Ada Quill is out to watch at home');
  assert.equal(alertPhrase(release({ media_type: 'tv', person_role: 'creator', release_kind: 'premiere' })), 'from creator Ada Quill has premiered');
  assert.equal(alertPhrase(season()), 'season 2 is ready: every episode is on Service One');
  assert.equal(alertPhrase(season({ provider_name: null })), null);
  assert.equal(alertPhrase({ type: 'new_follower' }), null);
  assert.equal(ALERT_NOTIFICATIONS.badges.person_release, 'New release');
  assert.equal(ALERT_NOTIFICATIONS.badges.season_ready, 'Whole season ready');
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
  assert.equal(content.context, 'Alerts are a Premium feature');
  assert.match(content.body, /actors and directors/);
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
