// Pure comparison logic for `npm run mobile:deps`. The CLI wrapper in
// scripts/check-expo-sdk-deps.mjs reads the files; the decisions live here so
// apps/web/tests/unit/expoSdkDeps.test.js can prove the guard flags the bumps
// that actually broke the build and clears the ones that never did.
//
// See scripts/check-expo-sdk-deps.mjs for why this exists.

import semver from 'semver';

/** Strip a leading range operator: `~57.0.21` -> `57.0.21`. */
export function baseVersion(spec) {
  return String(spec).trim().replace(/^[~^><= ]+/, '');
}

/**
 * The question is whether the declared range and the SDK's range can agree on
 * ANY version — `semver.intersects`, not string equality and not "does the
 * declared range contain the SDK's exact pin". Both weaker tests produce false
 * alarms on this repo: `~57.0.12` vs an expected `~57.0.17` is fine (npm
 * installs 57.0.17, which satisfies both), and `^0.21.2` vs `~0.21.0` is fine
 * for the same reason even though neither contains the other's floor.
 *
 * What does not intersect is the real thing: `0.87.1` against `0.86.3`, and
 * `3.1.1` against `2.2.0`. No installable version satisfies both, so the app
 * is guaranteed to be running something the SDK was not built against. That is
 * the shape that broke the native build.
 *
 * @param {Record<string,string>} declared  apps/mobile package.json deps + devDeps
 * @param {Record<string,string>} bundled   expo/bundledNativeModules.json
 * @returns {{ ok: boolean, drifted: {name:string, declared:string, expected:string}[] }}
 *
 * Only packages Expo pins are checked. Anything absent from
 * bundledNativeModules is not the SDK's business (posthog-react-native,
 * @supabase/supabase-js, aes-js and friends) and is left alone.
 */
export function checkExpoSdkDeps(declared, bundled) {
  const drifted = [];
  for (const [name, spec] of Object.entries(declared)) {
    const expected = bundled[name];
    if (!expected) continue;

    // An unparseable spec (a git url, a workspace alias) is not something this
    // check can reason about, so it is left alone rather than guessed at.
    if (semver.validRange(spec) === null || semver.validRange(expected) === null) continue;

    if (!semver.intersects(spec, expected)) {
      drifted.push({ name, declared: spec, expected });
    }
  }
  drifted.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: drifted.length === 0, drifted };
}
