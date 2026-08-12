import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* `apps/web/src/api/` and `apps/web/src/domain/` were nine files, 27 lines,
 * and no behaviour — every one a bare `export * from '@plot/core/…'`. They were
 * also inconsistently used: 14 files imported both a shim and `@plot/core`
 * directly for the same symbol, so "where does this live" had two answers and
 * the one you got depended on which file you opened.
 *
 * The shims that remain (hooks/, utils/, copy/) have a reason to: hooks are
 * imported by name across the app, and src/copy is what the Storybook Content
 * pages read. This guard is only about not growing the two that didn't.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const WEB_SRC = join(REPO_ROOT, 'apps/web/src');
const GONE = ['api', 'domain'];

test('the deleted shim directories have not come back', () => {
  const present = GONE.filter(d => existsSync(join(WEB_SRC, d)));
  assert.deepEqual(
    present, [],
    `apps/web/src/${present.join(', ')} is back. Import @plot/core/… directly instead of `
      + 're-exporting it through a new directory.',
  );
});

test('nothing imports through the deleted shim directories', () => {
  const SOURCE_EXT = /\.(js|jsx)$/;
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!SOURCE_EXT.test(entry)) continue;
      if (full === fileURLToPath(import.meta.url)) continue; // this file quotes the pattern
      const src = readFileSync(full, 'utf8');
      // A relative import into either directory, as opposed to @plot/core.
      if (/from\s+'\.{1,2}\/(?:api|domain)\//.test(src)) {
        offenders.push(relative(REPO_ROOT, full));
      }
    }
  };
  walk(WEB_SRC);
  walk(join(REPO_ROOT, 'apps/web/tests'));

  assert.deepEqual(offenders, [], `Point these at @plot/core:\n  ${offenders.join('\n  ')}`);
});
