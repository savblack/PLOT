import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorPostForDay,
  fixedFeatureForDay,
  isAnchorDay,
  questionSlotForDay,
} from '../planner/cadence.mjs';

test('anchor cadence is Monday trending and Tuesday upcoming', () => {
  assert.equal(anchorPostForDay('Monday'), 'trending');
  assert.equal(anchorPostForDay('Tuesday'), 'upcoming');
  assert.equal(anchorPostForDay('Friday'), null);
  assert.equal(anchorPostForDay('Wednesday'), null);
  assert.equal(isAnchorDay('Monday'), true);
  assert.equal(isAnchorDay('Tuesday'), true);
  assert.equal(isAnchorDay('Friday'), false);
  assert.equal(isAnchorDay('Sunday'), false);
});

test('fixed-feature cadence matches Wednesday watch tonight and Saturday hidden gem', () => {
  assert.equal(fixedFeatureForDay('Wednesday'), 'watch_tonight');
  assert.equal(fixedFeatureForDay('Saturday'), 'hidden_gem');
  assert.equal(fixedFeatureForDay('Tuesday'), null);
});

test('conversation cadence stays on Tuesday, Thursday, and Sunday only', () => {
  assert.equal(questionSlotForDay('Tuesday'), 'mid');
  assert.equal(questionSlotForDay('Thursday'), 'mid');
  assert.equal(questionSlotForDay('Sunday'), 'lead');
  assert.equal(questionSlotForDay('Wednesday'), null);
});
