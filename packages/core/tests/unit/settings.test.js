import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSelectionSummary, searchSettingsSections, SETTINGS_SECTIONS } from '../../settings.js';

test('selection summary shows four names and counts the remaining items', () => {
  assert.equal(settingsSelectionSummary(['ABC', 'SBS', 'Seven', 'Nine', 'Ten', 'ABC TV Plus', 'SBS Viceland', '7Two']), 'ABC, SBS, Seven, Nine +4 more');
  assert.equal(settingsSelectionSummary(['Netflix', 'Apple TV+', 'Prime Video', 'Disney+']), 'Netflix, Apple TV+, Prime Video, Disney+');
  assert.equal(settingsSelectionSummary([{ name: 'Netflix' }, { name: 'Apple TV+' }, { name: 'Prime Video' }, { name: 'Disney+' }, { name: 'Stan' }]), 'Netflix, Apple TV+, Prime Video, Disney+ +1 more');
});

test('empty and legacy selections are honest without guessing identifiers', () => {
  assert.equal(settingsSelectionSummary(null), 'None selected');
  assert.equal(settingsSelectionSummary([]), 'None selected');
  assert.equal(settingsSelectionSummary([{}]), 'Unnamed selection');
});

test('settings search finds relocated actions with all query words', () => {
  assert.deepEqual(searchSettingsSections('  invoice ').map(s => s.id), ['billing']);
  assert.deepEqual(searchSettingsSections('export csv').map(s => s.id), ['privacy']);
  assert.deepEqual(searchSettingsSections('plex').map(s => s.id), ['connections']);
  assert.equal(searchSettingsSections('unmatched').length, 0);
  assert.equal(searchSettingsSections(' ').length, SETTINGS_SECTIONS.length);
});
