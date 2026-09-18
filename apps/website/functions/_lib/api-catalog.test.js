// The API catalog (RFC 9727) is static JSON, so nothing at runtime notices when
// it names a URL the site does not serve, or when a _headers rule that gives it
// its content type is dropped. A catalog that points at a 404, or that Pages
// serves as application/octet-stream, is worse than no catalog: it is a
// published promise that fails on the first client to follow it. These tests
// are the only thing that checks either. They live here because
// `npm run test:website` is what CI runs for this site.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(site + path, 'utf8');

const catalog = JSON.parse(read('.well-known/api-catalog'));
const openapi = JSON.parse(read('api/openapi.json'));
const headers = read('_headers');

const ORIGIN = 'https://theplot.tv';
const LINK_RELATIONS = ['service-desc', 'service-doc', 'status', 'describedby'];

/** Every href the catalog names, flattened to { rel, href, type }. */
const links = catalog.linkset.flatMap((entry) =>
  LINK_RELATIONS.flatMap((rel) => (entry[rel] ?? []).map((link) => ({ rel, ...link }))));

/** Does this site actually serve `pathname`, as a static file or a Function? */
function serves(pathname) {
  const relative = pathname.replace(/^\//, '');
  return existsSync(site + relative) || existsSync(`${site}functions/${relative}.js`);
}

test('the catalog is a non-empty linkset of PLOT anchors', () => {
  assert.ok(Array.isArray(catalog.linkset), 'linkset must be an array');
  assert.ok(catalog.linkset.length > 0, 'an empty catalog tells a client nothing');
  for (const entry of catalog.linkset) {
    assert.ok(entry.anchor?.startsWith(`${ORIGIN}/`), `anchor must be an absolute PLOT URL: ${entry.anchor}`);
    assert.ok(serves(new URL(entry.anchor).pathname), `catalog anchors an endpoint the site does not serve: ${entry.anchor}`);
  }
});

test('every entry carries the relations RFC 9727 asks for', () => {
  for (const entry of catalog.linkset) {
    for (const rel of ['service-desc', 'service-doc']) {
      assert.ok(Array.isArray(entry[rel]) && entry[rel].length > 0, `${entry.anchor} is missing ${rel}`);
    }
  }
});

test('nothing in the catalog points at a URL this site does not serve', () => {
  for (const { rel, href } of links) {
    const { origin, pathname } = new URL(href);
    assert.equal(origin, ORIGIN, `${rel} link leaves theplot.tv: ${href}`);
    assert.ok(serves(pathname), `${rel} link points at a path the site does not serve: ${href}`);
  }
});

test('_headers gives every document the catalog advertises its stated type', () => {
  // A rule is `/path` on its own line, then indented `Header: value` lines.
  const rules = Object.fromEntries(
    headers
      .split(/\n(?=\/)/)
      .map((block) => [block.split('\n')[0].trim(), block])
      .filter(([path]) => path.startsWith('/')));

  // What Pages serves a static file as when no rule says otherwise. Anything
  // the catalog advertises that is not in this map needs its own rule, and a
  // path with no extension at all (the catalog itself) always does.
  const BY_EXTENSION = { '.txt': 'text/plain', '.html': 'text/html', '.json': 'application/json' };

  assert.match(rules['/.well-known/api-catalog'] ?? '', /Content-Type: application\/linkset\+json/,
    'the catalog itself must be served as application/linkset+json');

  for (const { href, type } of links) {
    const { pathname } = new URL(href);
    if (!existsSync(site + pathname.replace(/^\//, ''))) continue; // a Function sets its own
    const rule = rules[pathname];
    if (rule) {
      assert.match(rule, new RegExp(`Content-Type: ${type.replace('+', '\\+')}`),
        `${pathname} is advertised as ${type} but its _headers rule says otherwise`);
    } else {
      const extension = pathname.slice(pathname.lastIndexOf('.'));
      assert.equal(BY_EXTENSION[extension], type,
        `${pathname} is advertised as ${type}, which Pages will not serve it as without a _headers rule`);
    }
  }
});

test('the homepage advertises the catalog in a Link header', () => {
  const home = headers.split(/\n(?=\/)/).find((block) => block.split('\n')[0].trim() === '/');
  assert.match(home ?? '', /rel="api-catalog"/);
});

test('the OpenAPI description covers each anchored endpoint', () => {
  assert.equal(openapi.servers[0].url, ORIGIN);
  for (const entry of catalog.linkset) {
    const { pathname } = new URL(entry.anchor);
    assert.ok(openapi.paths[pathname], `${pathname} is in the catalog but not in the OpenAPI description`);
  }
});
