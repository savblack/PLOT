import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTIONS_ENABLED,
  anchorChainForDay,
  anchorPostForDay,
  fixedFeatureForDay,
  isAnchorDay,
  postTypeShips,
  questionSlotForDay,
} from '../planner/cadence.mjs';

test('anchor chains cover Monday, Tuesday, Thursday, Friday, and Sunday', () => {
  assert.deepEqual(anchorChainForDay('Monday'), ['trending']);
  assert.deepEqual(anchorChainForDay('Tuesday'), ['upcoming']);
  assert.deepEqual(anchorChainForDay('Thursday'), ['trailer', 'countdown']);
  assert.deepEqual(anchorChainForDay('Friday'), ['now_streaming']);
  assert.deepEqual(anchorChainForDay('Sunday'), ['on_this_day']);
  assert.equal(anchorPostForDay('Thursday'), 'trailer');
  assert.equal(anchorPostForDay('Friday'), 'now_streaming');
  assert.equal(anchorPostForDay('Sunday'), 'on_this_day');
  assert.equal(isAnchorDay('Monday'), true);
  assert.equal(isAnchorDay('Friday'), true);
  assert.equal(isAnchorDay('Sunday'), true);
  assert.equal(isAnchorDay('Wednesday'), false);
  assert.equal(isAnchorDay('Saturday'), false);
  assert.deepEqual(anchorChainForDay('Wednesday'), []);
});

test('fixed-feature cadence matches Wednesday watch tonight and Saturday hidden gem', () => {
  assert.equal(fixedFeatureForDay('Wednesday'), 'watch_tonight');
  assert.equal(fixedFeatureForDay('Saturday'), 'hidden_gem');
  assert.equal(fixedFeatureForDay('Tuesday'), null);
  assert.equal(fixedFeatureForDay('Thursday'), null);
});

test('question posts do not ship', () => {
  assert.equal(QUESTIONS_ENABLED, false);
  assert.equal(questionSlotForDay('Tuesday'), null);
  assert.equal(questionSlotForDay('Thursday'), null);
  assert.equal(questionSlotForDay('Sunday'), null);
  assert.equal(questionSlotForDay('Wednesday'), null);
  assert.equal(postTypeShips('question'), false);
  assert.equal(postTypeShips('trending'), true);
  assert.equal(postTypeShips('now_streaming'), true);
});
