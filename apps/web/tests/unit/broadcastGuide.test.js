import test from 'node:test';
import assert from 'node:assert/strict';
import { guideDate, guideDay, isOnNow, selectedGuideChannels, validateGuideSnapshot, guideAgenda } from '../../../../packages/core/broadcastGuide.js';
const programme = { id: 'abc:1', channelId: 'abc', title: 'News', start: '2026-09-16T13:45:00Z', end: '2026-09-16T14:30:00Z' };
const snapshot = { region: 'Sydney', fetchedAt: '2026-09-16T00:00:00Z', channels: [{ id: 'abc', name: 'ABC' }], programmes: [programme] };
test('keeps local date and DST timezone conversion together', () => {
  assert.equal(guideDate('2026-09-16T14:15:00Z', 'Australia/Sydney'), '2026-09-17');
  assert.equal(guideDate('2026-10-05T13:15:00Z', 'Australia/Sydney'), '2026-10-06');
  assert.equal(guideDate('2026-10-05T13:15:00Z', 'Australia/Brisbane'), '2026-10-05');
  assert.equal(guideDay('2026-12-31', 1), '2027-01-01');
});
test('explicit empty channel selection stays empty', () => {
  assert.deepEqual(selectedGuideChannels(snapshot.channels, []), []);
  assert.equal(selectedGuideChannels(snapshot.channels, null).length, 1);
  assert.deepEqual(selectedGuideChannels(snapshot.channels, ['other-region']), []);
});
test('on now uses start-inclusive and end-exclusive instants', () => {
  assert.equal(isOnNow(programme, Date.parse(programme.start) - 1), false);
  assert.equal(isOnNow(programme, Date.parse(programme.start)), true);
  assert.equal(isOnNow(programme, Date.parse(programme.end)), false);
  assert.equal(isOnNow({ ...programme, title: 'To Be Advised Later' }, Date.parse(programme.start)), false);
});
test('overnight broadcasts appear on both intersecting local dates', () => {
  const options = { timezone: 'Australia/Sydney', channelIds: ['abc'], now: Date.parse('2026-09-16T14:00:00Z'), mode: 'all' };
  assert.equal(guideAgenda([programme], { ...options, date: '2026-09-16' }).length, 1);
  assert.equal(guideAgenda([programme], { ...options, date: '2026-09-17' }).length, 1);
  assert.equal(guideAgenda([programme], { ...options, date: '2026-09-18' }).length, 0);
  assert.equal(guideAgenda([programme], { ...options, date: '2026-09-17', channelIds: [] }).length, 0);
});
test('rejects wrong regions, broken dates, duplicates and orphan channels', () => {
  assert.equal(validateGuideSnapshot(snapshot, 'Sydney'), snapshot);
  assert.throws(() => validateGuideSnapshot(snapshot, 'Perth'));
  for (const patch of [{ start: 'bad' }, { end: programme.start }, { channelId: 'other' }]) {
    assert.throws(() => validateGuideSnapshot({ ...snapshot, programmes: [{ ...programme, ...patch }] }, 'Sydney'));
  }
  assert.throws(() => validateGuideSnapshot({ ...snapshot, programmes: [programme, programme] }, 'Sydney'));
});

test('country markets never fall back to a different country', async () => {
  const { guideMarketsForCountry, GUIDE_REGIONS } = await import('../../../../packages/core/broadcastGuide.js');
  assert.ok(guideMarketsForCountry('US').every(m => m.country === 'US'));
  assert.deepEqual(guideMarketsForCountry('XX'), []);
  assert.equal(GUIDE_REGIONS.find(m => m.id === 'US-other').provider, null);
  assert.equal(GUIDE_REGIONS.find(m => m.id === 'NZ-national').timezone, 'Pacific/Auckland');
  assert.equal(new Set(GUIDE_REGIONS.map(m => m.id)).size, GUIDE_REGIONS.length);
});

test('US and NZ days preserve the station timezone across midnight', () => {
  assert.equal(guideDate('2026-09-17T01:00:00Z', 'America/New_York'), '2026-09-16');
  assert.equal(guideDate('2026-09-17T01:00:00Z', 'Pacific/Auckland'), '2026-09-17');
});
