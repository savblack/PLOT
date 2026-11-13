#!/usr/bin/env node
/**
 * Fail if a Pages Function is not reachable through its project's _routes.json.
 *
 * WHY: every Function call spends the Cloudflare account's free allowance of
 * 100,000 Workers requests a day, which ran out on 2026-11-11. So both Pages
 * projects list only their real Function routes in _routes.json instead of
 * "/*". The cost is that a new file under functions/ is silently never run
 * (Pages serves the static site, or the SPA shell, in its place) unless its
 * path is added to the list too. This check catches that.
 *
 * It also checks the paths that exist only inside a middleware (redirects,
 * host rules). Those have no file of their own, so they are listed below; keep
 * that list in step with the middleware.
 *
 * Usage:  node scripts/check-pages-routes.mjs   (part of `pnpm run lint`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PROJECTS = [
  {
    name: 'app.theplot.tv',
    functions: 'functions',
    routes: 'apps/web/public/_routes.json',
    middlewareOnly: [],
  },
  {
    name: 'theplot.tv',
    functions: 'apps/website/functions',
    routes: 'apps/website/_routes.json',
    // Handled in apps/website/functions/_middleware.js (and _lib/vanity.js).
    middlewareOnly: ['/', '/robots.txt', '/ig', '/ig/', '/x', '/x/', '/th', '/th/', '/plans', '/plans.html', '/whats-on/'],
  },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// functions/watch-with/[username]/[key].js -> /watch-with/sample/sample
function routeFor(file, base) {
  const rel = relative(base, file).replace(/\\/g, '/');
  if (!rel.endsWith('.js') || rel.endsWith('.test.js')) return null;
  if (rel.split('/').some((part) => part.startsWith('_'))) return null; // _lib, _middleware
  const path = rel
    .replace(/\.js$/, '')
    .replace(/(^|\/)index$/, '')
    .replace(/\[\[[^\]]+\]\]|\[[^\]]+\]/g, 'sample');
  return `/${path}`;
}

const matcher = (pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

let failed = false;
for (const project of PROJECTS) {
  const routes = JSON.parse(readFileSync(resolve(ROOT, project.routes), 'utf8'));
  const include = (routes.include || []).map(matcher);
  const exclude = (routes.exclude || []).map(matcher);
  const reaches = (path) => include.some((re) => re.test(path)) && !exclude.some((re) => re.test(path));

  const base = resolve(ROOT, project.functions);
  const paths = [
    ...walk(base).map((file) => routeFor(file, base)).filter(Boolean),
    ...project.middlewareOnly,
  ];
  for (const path of paths) {
    if (!reaches(path)) {
      console.error(`check-pages-routes: ${project.name} has a Function for ${path}, but ${project.routes} does not send that path to Functions. Add it to "include".`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
