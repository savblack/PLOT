import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* `packages/core/events.js` replaced direct `window` event usage so the same
   hooks run on React Native, which has no `window`. The migration left one
   emitter behind: ImportView still dispatched `plot:history-changed` on
   `window`, where useHistory — subscribed via events.js — could never hear it.
   Nothing failed; the history list just silently stopped reloading after an
   import.

   A guard nobody has watched fail is not a guard, so this file proves the
   detector flags the shape that shipped before it clears the tree. */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCAN_ROOTS = ['apps/web/src', 'apps/mobile', 'packages/core'];
const SOURCE_EXT = /\.(js|jsx|ts|tsx)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'ios', 'android', '.expo']);

/** Names owned by the core bus — dispatching these on `window` reaches nobody. */
const CORE_BUS_EVENTS = ['plot:history-changed'];

/** Find `window.dispatchEvent(new Event('plot:…'))` for a core-bus event name. */
export function findWindowDispatchOfBusEvent(source) {
  const hits = [];
  for (const name of CORE_BUS_EVENTS) {
    const re = new RegExp(`dispatchEvent\\s*\\(\\s*new\\s+Event\\s*\\(\\s*['"\`]${name}['"\`]`, 'g');
    if (re.test(source)) hits.push(name);
  }
  return hits;
}

function sourceFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (SOURCE_EXT.test(entry)) acc.push(full);
  }
  return acc;
}

test('the detector flags the emitter that actually shipped', () => {
  const shipped = `track(EVENTS.IMPORT_COMPLETED, { source: platform?.id, count: inserted });
    // Notify history hook to reload
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('plot:history-changed'));`;
  assert.deepEqual(findWindowDispatchOfBusEvent(shipped), ['plot:history-changed']);
});

test('the detector ignores emitting on the core bus', () => {
  const fixed = `import { emit } from '@plot/core/events.js';
    emit(HISTORY_CHANGED_EVENT);`;
  assert.deepEqual(findWindowDispatchOfBusEvent(fixed), []);
});

test('the detector ignores unrelated window events', () => {
  const unrelated = `window.dispatchEvent(new Event('resize'));`;
  assert.deepEqual(findWindowDispatchOfBusEvent(unrelated), []);
});

test('no source file dispatches a core-bus event on window', () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(join(REPO_ROOT, root))) {
      const hits = findWindowDispatchOfBusEvent(readFileSync(file, 'utf8'));
      for (const name of hits) offenders.push(`${relative(REPO_ROOT, file)} → ${name}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Dispatch these on the core bus (emit from @plot/core/events.js) instead:\n  ${offenders.join('\n  ')}`,
  );
});
