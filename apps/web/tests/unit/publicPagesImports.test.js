import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The sign-up, log-in and log-out pages are bundled eagerly with the router
// (router.jsx), so everything they import statically is downloaded before a
// phone can show the sign-up form. Supabase is loaded on demand there
// (utils/loadSupabase.js). On 2026-11-12 LogoutPage's static import of
// @plot/core/useHistory.js was found pulling Supabase and the history code
// into every public page, which the bundle-size check could not see because
// the router chunk is not in index.html's preloads. This walks the static
// import graph from the entry points and fails if Supabase is reachable.

const ROOT = resolve(import.meta.dirname, '../../../..');
const WEB_SRC = join(ROOT, 'apps/web/src');
const ENTRY_POINTS = ['main.jsx', 'router.jsx'].map(f => join(WEB_SRC, f));
const FORBIDDEN = [join(ROOT, 'packages/core/supabase.js'), '@supabase/supabase-js'];

// Static imports and re-exports only; `import('…')` is lazy by design.
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^;'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith('.')) return resolve(dirname(fromFile), spec);
  if (spec.startsWith('@plot/core/')) return join(ROOT, 'packages/core', spec.slice('@plot/core/'.length));
  if (spec.startsWith('@plot/ui/')) return join(ROOT, 'packages/ui', spec.slice('@plot/ui/'.length));
  return spec; // a package from node_modules: recorded, not walked
}

function staticGraph(entries) {
  const seen = new Map(); // module -> the module that first imported it
  const queue = entries.map(e => [e, null]);
  while (queue.length) {
    const [file, from] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, from);
    if (!file.startsWith('/') || !/\.(m?js|jsx)$/.test(file) || !existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(STATIC_IMPORT)) {
      queue.push([resolveSpecifier(spec, file), file]);
    }
  }
  return seen;
}

function chain(graph, target) {
  const path = [];
  for (let at = target; at; at = graph.get(at)) path.unshift(at.replace(`${ROOT}/`, ''));
  return path.join('\n  -> ');
}

test('the public pages never statically import Supabase', () => {
  const graph = staticGraph(ENTRY_POINTS);
  assert.ok(graph.has(join(WEB_SRC, 'pages/AuthPage.jsx')), 'walker should reach AuthPage');
  assert.ok(graph.has(join(WEB_SRC, 'pages/LogoutPage.jsx')), 'walker should reach LogoutPage');
  for (const target of FORBIDDEN) {
    assert.ok(!graph.has(target), `Supabase is statically reachable from the public pages:\n  ${chain(graph, target)}`);
  }
});
