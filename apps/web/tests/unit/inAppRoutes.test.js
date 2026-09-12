import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Two navigations pointed at paths the router has no entry for, so both landed
 * the user on the 404 page: the 404's own "Search titles" button went to
 * `/app/home`, and a like/comment notification went to `/feed`, deleted with
 * the social feed (#499). Nothing catches this at build time. React Router
 * resolves paths at runtime, so a dead target is a silent 404 that only shows
 * up when someone clicks the one control that uses it.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const WEB_SRC = join(REPO_ROOT, 'apps/web/src');
const SELF = fileURLToPath(import.meta.url);

/** Every `path:` in router.jsx, normalised to an absolute pattern. */
function routePatterns() {
  const router = readFileSync(join(WEB_SRC, 'router.jsx'), 'utf8');
  const paths = [...router.matchAll(/\bpath:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(paths.length > 10, 'router.jsx parse found suspiciously few routes');
  return paths
    .filter(p => p !== '*')
    .map(p => (p.startsWith('/') ? p : `/${p}`));
}

function segments(path) {
  return path.split('/').filter(Boolean);
}

function matchesRoute(target, patterns) {
  const parts = segments(target);
  return patterns.some((pattern) => {
    const shape = segments(pattern);
    if (shape.length !== parts.length) return false;
    return shape.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
  });
}

/** Literal in-app destinations: navigate('/x'), to="/x", href="/x". */
function inAppTargets(source) {
  const found = [];
  const patterns = [
    /\bnavigate\(\s*(['"`])(\/[^'"`]*)\1/g,
    /\bto=\{?\s*(['"`])(\/[^'"`]*)\1/g,
    /\bhref=\{?\s*(['"`])(\/[^'"`]*)\1/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      // A `${…}` stands in for one dynamic segment, the shape the route
      // declares; a query string or hash is not part of the match.
      const target = m[2].replace(/\$\{[^}]*\}/g, 'dynamic').split(/[?#]/)[0];
      if (/\.[a-z0-9]{2,4}$/i.test(target)) continue; // an asset, not a route
      found.push(target);
    }
  }
  return found;
}

test('every in-app navigation target resolves to a declared route', () => {
  const patterns = routePatterns();
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(entry) || full === SELF) continue;
      for (const target of inAppTargets(readFileSync(full, 'utf8'))) {
        if (!matchesRoute(target, patterns)) {
          offenders.push(`${relative(REPO_ROOT, full)} → ${target}`);
        }
      }
    }
  };
  walk(WEB_SRC);

  assert.deepEqual(
    offenders, [],
    `These navigate somewhere router.jsx does not declare, so they render the 404 page:\n  ${offenders.join('\n  ')}`,
  );
});
