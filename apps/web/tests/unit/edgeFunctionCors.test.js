/* Every edge function the web app calls from a browser must answer the CORS
 * preflight and send Access-Control-Allow-Origin.
 *
 * The app runs on app.theplot.tv and the functions on *.supabase.co, so a
 * browser sends an OPTIONS request first and refuses to send the real one
 * unless that is answered. `delete-account` never answered it: deleting an
 * account from web failed with "Failed to fetch" in every browser until
 * 2026-11-16, while curl and the iPhone app (no preflight) worked, so nothing
 * that tested the function directly could see it (#1711).
 *
 * This reads the source rather than running the function: index.ts is a
 * Deno.serve handler that node cannot import. It checks that the handling is
 * there, not that it is right.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SOURCE_ROOTS = [join(repoRoot, 'apps', 'web', 'src'), join(repoRoot, 'packages', 'core')];
const CALL = /(?:edgeFunctionUrl|functions\.invoke)\(\s*['"]([a-z0-9-]+)['"]/g;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tests') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.(test|stories)\./.test(entry.name)) out.push(path);
  }
  return out;
}

function browserCalledFunctions() {
  const names = new Set();
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      for (const match of readFileSync(file, 'utf8').matchAll(CALL)) names.add(match[1]);
    }
  }
  return [...names].sort();
}

test('the scan finds the functions the web app calls', () => {
  const names = browserCalledFunctions();
  assert.ok(names.includes('delete-account'), `delete-account missing from ${names.join(', ')}`);
  assert.ok(names.includes('export-user-data'), `export-user-data missing from ${names.join(', ')}`);
});

test('every edge function the web app calls answers the browser preflight', () => {
  for (const name of browserCalledFunctions()) {
    const entry = join(repoRoot, 'supabase', 'functions', name, 'index.ts');
    assert.ok(existsSync(entry), `${name} is called from the web app but supabase/functions/${name}/index.ts does not exist`);
    const source = readFileSync(entry, 'utf8');
    assert.match(source, /Access-Control-Allow-Origin/, `${name} sends no Access-Control-Allow-Origin header`);
    assert.match(source, /['"]OPTIONS['"]/, `${name} has no OPTIONS branch for the preflight`);
  }
});
