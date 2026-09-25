import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { onRequest as listPage } from '../../../../functions/list/[id].js';
import { onRequest as profilePage } from '../../../../functions/u/[username].js';
import { onRequest as listSitemap } from '../../../../functions/sitemap-lists.xml.js';
import { PROFILE_PRIVACY } from '../../../../packages/core/copy/profilePrivacy.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../supabase/migrations');

// The latest `create policy "<name>"` body across every migration: what
// production runs, whichever file last touched it.
function latestPolicy(name) {
  let body = null;
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const re = new RegExp(`create policy "${name}"[\\s\\S]*?;`, 'gi');
    for (const m of sql.matchAll(re)) body = m[0];
  }
  return body;
}

// A later migration recreating one of these from a stale body would quietly
// bring back a second visibility rule, which is what 20260925120000 removed.
test('every profile-content read policy goes through can_view_profile', () => {
  for (const name of [
    'public profiles history is readable',
    'public profiles favourites readable',
    'public profiles top lists readable',
    'public profiles list items readable',
    'public profiles watching progress readable',
    'feed posts visible by profile visibility',
  ]) {
    const body = latestPolicy(name);
    assert.ok(body, `${name}: no definition found`);
    assert.match(body, /can_view_profile\(/, `${name} must use can_view_profile`);
  }
});

test('custom list read policies go through can_view_custom_list, not is_public', () => {
  for (const name of ['Public custom lists are readable', 'Items of public custom lists are readable']) {
    const body = latestPolicy(name);
    assert.match(body, /can_view_custom_list\(/, name);
    assert.doesNotMatch(body, /is_public/, name);
  }
});

test('private title notes stay owner-only', () => {
  const sql = readFileSync(join(MIGRATIONS, '20260917010000_private_title_notes.sql'), 'utf8');
  assert.doesNotMatch(sql, /can_view_profile|is_accepted_follower|is_profile_public/);
});

const withFetch = async (handler, fn) => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  try { return await fn(calls); } finally { globalThis.fetch = original; }
};

test('the list page asks only for lists anyone may read, and keeps link-only lists out of search', async () => {
  const request = new Request('https://app.theplot.tv/list/test-list');
  for (const [visibility, indexed] of [['public', true], ['link', false]]) {
    await withFetch((url) => Response.json(url.includes('user_custom_lists?')
      ? [{ id: 'test-list', name: 'Weekend', user_id: 'test-owner', visibility }] : []), async (calls) => {
      const html = await (await listPage({ request, params: { id: 'test-list' }, env: {} })).text();
      assert.match(calls[0].url, /visibility=in\.\(public,link\)/);
      assert.equal(/name="robots" content="noindex"/.test(html), !indexed, visibility);
    });
  }
});

test('the list sitemap lists only public lists', async () => {
  await withFetch(() => Response.json([]), async (calls) => {
    await listSitemap({ request: new Request('https://app.theplot.tv/sitemap-lists.xml') });
    assert.match(calls[0].url, /visibility=eq\.public/);
    assert.doesNotMatch(calls[0].url, /is_public/);
  });
});

const card = { id: 'test-owner', username: 'sam', display_name: 'Sam', is_public: true, profile_sections: ['recent'] };
const top = [{ list_type: 'movies', rank: 1, tmdb_id: 1, media_type: 'movie', title: 'Top Film Title', poster_path: null }];

test('the profile snapshot counts followers through the RPC and respects section toggles', async () => {
  await withFetch((url) => {
    if (url.endsWith('/index.html')) return new Response('<html><head></head><body><div id="root"></div></body></html>');
    if (url.includes('/rpc/get_profile_card')) return Response.json([card]);
    if (url.includes('/rpc/get_follow_counts')) return Response.json([{ followers: 7, following: 2 }]);
    if (url.includes('user_top_lists')) return Response.json(top);
    return Response.json([]);
  }, async (calls) => {
    const html = await (await profilePage({ request: new Request('https://app.theplot.tv/u/sam'), params: { username: 'sam' } })).text();
    assert.ok(!calls.some(c => c.url.includes('/follows?')), 'follows rows are unreadable to anon');
    assert.match(html, /"interactionType":"https:\/\/schema.org\/FollowAction","userInteractionCount":7/);
    assert.doesNotMatch(html, /Top Film Title/, 'topMovies is switched off');
  });
});

test('a private profile never renders a snapshot', async () => {
  await withFetch((url) => {
    if (url.endsWith('/index.html')) return new Response('<html><head></head><body><div id="root"></div></body></html>');
    if (url.includes('/rpc/get_profile_card')) return Response.json([{ ...card, is_public: false }]);
    return Response.json([]);
  }, async () => {
    const html = await (await profilePage({ request: new Request('https://app.theplot.tv/u/sam'), params: { username: 'sam' } })).text();
    assert.match(html, /noindex/);
    assert.doesNotMatch(html, /seo-snapshot/);
  });
});

test('privacy copy has no em dashes and does not claim followers are shut out', () => {
  const strings = [];
  const walk = (v) => typeof v === 'string' ? strings.push(v)
    : typeof v === 'function' ? strings.push(v('favourites'))
      : v && typeof v === 'object' ? Object.values(v).forEach(walk) : null;
  walk(PROFILE_PRIVACY);
  for (const s of strings) assert.doesNotMatch(s, /—/, s);
  assert.doesNotMatch(PROFILE_PRIVACY.privateDescription, /^Only you can/);
});
