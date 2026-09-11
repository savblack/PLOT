import test from 'node:test';
import assert from 'node:assert/strict';
import { baseVersion, checkExpoSdkDeps } from '../../../../scripts/lib/expoSdkDeps.mjs';

// A guard nobody has watched fail is not a guard. On 2026-09-11 the first iOS
// build in five weeks died compiling Swift because react-native was a minor
// above what Expo SDK 57 is built against, and nothing in the repo could see
// it. These are the real versions either side of that.

// From node_modules/expo/bundledNativeModules.json at SDK 57.0.21.
const SDK57 = {
  'react-native': '0.86.3',
  '@react-native-async-storage/async-storage': '2.2.0',
  '@react-native-community/datetimepicker': '9.1.0',
  'react-native-safe-area-context': '~5.7.0',
  'react-native-screens': '~4.26.0',
  'react-native-svg': '15.15.4',
  'react-native-web': '~0.21.0',
  'react-dom': '19.2.3',
  expo: '~57.0.21',
  'expo-router': '~57.0.20',
  'expo-constants': '~57.0.17',
};

test('baseVersion strips range operators', () => {
  assert.equal(baseVersion('~57.0.21'), '57.0.21');
  assert.equal(baseVersion('^0.21.2'), '0.21.2');
  assert.equal(baseVersion('0.86.3'), '0.86.3');
});

test('the aligned state on main passes', () => {
  const { ok, drifted } = checkExpoSdkDeps({
    'react-native': '0.86.3',
    '@react-native-async-storage/async-storage': '2.2.0',
    expo: '~57.0.21',
    'expo-router': '~57.0.20',
  }, SDK57);
  assert.equal(ok, true);
  assert.deepEqual(drifted, []);
});

test('#622: react-native one minor above the SDK is flagged', () => {
  // This is the bump that made the iOS build fail outright. RN 0.87 changed
  // RCTReactNativeFactoryDelegate, so Expo's conforming class stopped compiling.
  const { ok, drifted } = checkExpoSdkDeps({ 'react-native': '0.87.1' }, SDK57);
  assert.equal(ok, false);
  assert.deepEqual(drifted, [
    { name: 'react-native', declared: '0.87.1', expected: '0.86.3' },
  ]);
});

test('#557: async-storage a major above the SDK is flagged', () => {
  const { ok, drifted } = checkExpoSdkDeps({
    '@react-native-async-storage/async-storage': '3.1.1',
  }, SDK57);
  assert.equal(ok, false);
  assert.equal(drifted[0].declared, '3.1.1');
  assert.equal(drifted[0].expected, '2.2.0');
});

test('the full drift on main flags the seven that pin an unusable version', () => {
  // All nine packages `expo install --check` reported, exactly as declared.
  const { ok, drifted } = checkExpoSdkDeps({
    'react-native': '0.87.1',
    '@react-native-async-storage/async-storage': '3.1.1',
    '@react-native-community/datetimepicker': '9.2.0',
    'react-native-safe-area-context': '~5.9.1',
    'react-native-screens': '4.27.0',
    'react-native-svg': '15.15.5',
    'react-dom': '19.2.8',
    expo: '~57.0.19',
    'expo-router': '~57.0.18',
  }, SDK57);
  assert.equal(ok, false);
  assert.deepEqual(drifted.map(d => d.name), [
    '@react-native-async-storage/async-storage',
    '@react-native-community/datetimepicker',
    'react-dom',
    'react-native',
    'react-native-safe-area-context',
    'react-native-screens',
    'react-native-svg',
  ]);
});

test('lagging inside a compatible range is not drift', () => {
  // expo ~57.0.19 against an expected ~57.0.21 was reported by
  // `expo install --check` but is harmless: both ranges admit 57.0.21, so npm
  // installs a version the SDK is happy with. Flagging it would train people
  // to ignore this check.
  const { ok } = checkExpoSdkDeps({
    expo: '~57.0.19',
    'expo-router': '~57.0.18',
    'expo-constants': '~57.0.12',
  }, SDK57);
  assert.equal(ok, true);
});

test('overlapping ranges that contain neither floor are not drift', () => {
  // ^0.21.2 does not contain 0.21.0 and ~0.21.0 does not contain 0.21.2's
  // ceiling, but both admit 0.21.2. An intersection test gets this right;
  // "declared range contains the SDK pin" does not.
  const { ok } = checkExpoSdkDeps({ 'react-native-web': '^0.21.2' }, SDK57);
  assert.equal(ok, true);
});

test('packages Expo does not pin are left alone', () => {
  const { ok } = checkExpoSdkDeps({
    'posthog-react-native': '^4.67.0',
    '@supabase/supabase-js': '^2.115.0',
    'aes-js': '^3.1.2',
  }, SDK57);
  assert.equal(ok, true);
});

test('an unparseable spec is skipped rather than guessed at', () => {
  const { ok } = checkExpoSdkDeps({ 'react-native': 'workspace:*' }, SDK57);
  assert.equal(ok, true);
});
