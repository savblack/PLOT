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
    middlewareOnly: ['/robots.txt', '/ig', '/ig/', '/x', '/x/', '/th', '/th/', '/plans', '/plans.html', '/whats-on/'],
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

// The deploy-time validation Pages runs on _routes.json (wrangler's
// validateRoutes). A file that fails it fails the whole deploy, so check it
// here too: on 2026-11-13 "/whats-on/" next to "/whats-on/*" did exactly that.
function invalidRoutes(routes) {
  const problems = [];
  if (routes.version !== 1 || !Array.isArray(routes.include) || !Array.isArray(routes.exclude)) {
    return ['needs "version": 1 and "include" and "exclude" arrays'];
  }
  if (routes.include.length === 0) problems.push('"include" is empty');
  if (routes.include.length + routes.exclude.length > 100) problems.push('more than 100 rules');
  for (const list of [routes.include, routes.exclude]) {
    for (const rule of list) {
      if (!rule.startsWith('/')) problems.push(`"${rule}" does not start with /`);
      if (rule.length > 100) problems.push(`"${rule}" is over 100 characters`);
    }
    // A rule ending in "/*" may not share its prefix with any other rule.
    for (const splat of list.filter((rule) => rule.endsWith('/*'))) {
      const prefix = splat.slice(0, -1);
      for (const other of list) {
        if (other !== splat && other.startsWith(prefix)) problems.push(`"${other}" overlaps "${splat}"`);
      }
    }
  }
  return problems;
}

let failed = false;
for (const project of PROJECTS) {
  const routes = JSON.parse(readFileSync(resolve(ROOT, project.routes), 'utf8'));
  for (const problem of invalidRoutes(routes)) {
    console.error(`check-pages-routes: ${project.routes}: ${problem}. Cloudflare Pages refuses to deploy this.`);
    failed = true;
  }
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
