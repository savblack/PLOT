// Fail the build when apps/mobile declares a native dependency at a version
// Expo's installed SDK does not support.
//
// WHY THIS EXISTS
// On 2026-09-11 the first iOS build in five weeks failed, compiling Swift:
//
//     value of type 'ExpoReactNativeFactoryDelegate' has no member 'newArchEnabled'
//     type 'any RCTReactNativeFactoryDelegate' has no member 'extraModules(for:)'
//     ... 25 more of the same shape
//
// react-native was on 0.87.1; Expo SDK 57 pins 0.86.3. RN 0.87 changed
// RCTReactNativeFactoryDelegate, so Expo's ExpoReactNativeFactoryDelegate no
// longer matched the protocol it conforms to and nothing extending it compiled.
// The app could not be built at all.
//
// It was not one bad bump. NINE packages were off the SDK's versions, most
// pushed ahead by Dependabot group PRs (#622 alone moved 30): react-native,
// async-storage (a whole major), safe-area-context, screens, svg,
// datetimepicker and react-dom ahead; expo and expo-router behind.
//
// Nothing could catch it. Mobile's only gates are `tsc --noEmit` and ESLint,
// and a Swift protocol mismatch is invisible to both — the JS type-checks
// perfectly against a native module that will not compile. The app has never
// been built or run, so nothing downstream caught it either. The last
// successful build (2026-08-02) predated every one of these bumps.
//
// `npx expo install --check` reports the same drift, but it is not usable as a
// gate: it reads node_modules rather than package.json, and it exits 0 whether
// or not it finds anything. This reads what the repo declares and exits 1.
//
// Fix a failure with `cd apps/mobile && npx expo install --fix`, which rewrites
// every version to the SDK's. Expect that to need code changes when a downgrade
// crosses a major: #557 had moved sectionOpenState.ts onto async-storage 3.x's
// renamed getMany, and going back to 2.2.0 meant going back to multiGet.
//
// Usage:
//   node scripts/check-expo-sdk-deps.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkExpoSdkDeps } from './lib/expoSdkDeps.mjs';

const ROOT = process.cwd();
const PKG_REL = 'apps/mobile/package.json';
// Resolved from the installed expo, so the expectations always come from the
// SDK version actually in the lockfile rather than a number copied into a doc.
const BUNDLED_REL = 'node_modules/expo/bundledNativeModules.json';

function readJson(rel, hint) {
  try {
    return JSON.parse(readFileSync(join(ROOT, ...rel.split('/')), 'utf8'));
  } catch {
    console.error(`\n✗ cannot read ${rel}`);
    console.error(`  ${hint}\n`);
    process.exit(1);
  }
}

const pkg = readJson(PKG_REL, 'This check is hard-wired to that path; update it if the app moved.');
const bundled = readJson(BUNDLED_REL, 'Run `npm ci` first — this comes from the installed expo package.');

const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const { ok, drifted } = checkExpoSdkDeps(declared, bundled);

const sdk = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'node_modules', 'expo', 'package.json'), 'utf8')).version;
  } catch { return 'unknown'; }
})();

if (ok) {
  const checked = Object.keys(declared).filter(n => bundled[n]).length;
  console.log(`✓ all ${checked} Expo-managed deps match SDK ${sdk}`);
  process.exit(0);
}

console.error(`\n✗ ${drifted.length} dependency(ies) do not match what Expo SDK ${sdk} supports:\n`);
const pad = Math.max(...drifted.map(d => d.name.length));
for (const { name, declared: got, expected } of drifted) {
  console.error(`    ${name.padEnd(pad)}  declared ${got}   expected ${expected}`);
}
console.error(`\n  These compile fine and type-check fine. They break the NATIVE build,`);
console.error('  which no other check in this repo runs. react-native at one minor');
console.error('  above the SDK is what made the iOS build fail outright on 2026-09-11.\n');
console.error('  Fix:  cd apps/mobile && npx expo install --fix\n');
console.error('  If a downgrade crosses a major, expect to adjust code for the older');
console.error('  API — and do not "fix" this by widening the range instead.\n');
process.exit(1);
