// One-off backfill: fill in list_items.genre_ids for rows that were saved
// without them.
//
// WHY THIS EXISTS
// Mobile onboarding used to write list_items with a hand-rolled upsert that
// omitted genre_ids (fixed in PR #398, which routed it through the shared
// saveListItem). Titles seeded by mobile before that fix carry an empty
// genre_ids array, so they never match a genre filter and are invisible to the
// content-similarity half of get_for_you().
//
// This is idempotent and safe to re-run: it only ever touches rows whose
// genre_ids is empty, and it never overwrites a populated value.
//
// DELIBERATELY NOT BACKFILLED: provider_ids and streaming_date, which the same
// old code path also omitted. Both are region- and time-specific ("where can I
// watch this *now*"), so reconstructing today's value and stamping it onto a
// months-old row would invent data rather than recover it. The app refetches
// availability on demand, so those columns being empty costs nothing.
//
// Usage — from the repo root, with the root .env loaded:
//   node --env-file=.env scripts/backfill-list-item-genres.mjs              # dry run (default)
//   node --env-file=.env scripts/backfill-list-item-genres.mjs --apply      # actually write
//   node --env-file=.env scripts/backfill-list-item-genres.mjs --limit=50   # cap titles processed
//
// Needs SUPABASE_SERVICE_KEY (RLS would otherwise hide other users' rows) and
// TMDB_API_KEY. Both are already in the root .env.

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_KEY     = process.env.TMDB_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
  process.exit(1);
}
if (!TMDB_KEY) {
  console.error('Need TMDB_API_KEY (used to look up each title\'s genres).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Every list_items row with an empty genre_ids, paged so a big table is fine. */
async function fetchRowsMissingGenres() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('list_items')
      .select('id, tmdb_id, media_type, title, genre_ids')
      .eq('genre_ids', '{}')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`list_items read failed: ${error.message}`);
    if (!data?.length) break;
    // Re-check client-side; never trust the filter alone before a write.
    rows.push(...data.filter(r => !r.genre_ids || r.genre_ids.length === 0));
    if (data.length < PAGE) break;
  }
  return rows;
}

/** TMDB genre ids for one title. null = lookup failed (leave the row alone). */
async function fetchGenreIds(mediaType, tmdbId) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = new URL(`https://api.themoviedb.org/3/${type}/${tmdbId}`);
  url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url);
  if (res.status === 404) return [];            // title genuinely gone from TMDB
  if (!res.ok) return null;                      // transient — don't write anything
  const json = await res.json();
  return Array.isArray(json?.genres) ? json.genres.map(g => g.id).filter(Number.isInteger) : [];
}

async function main() {
  console.log(APPLY ? '▶ APPLY mode — rows will be written\n' : '▶ DRY RUN — nothing will be written (pass --apply to write)\n');

  const rows = await fetchRowsMissingGenres();
  if (!rows.length) {
    console.log('Nothing to do: no list_items rows have an empty genre_ids.');
    return;
  }

  // One TMDB call per distinct title, not per row — the same title saved by
  // 20 users is one lookup.
  const byTitle = new Map();
  for (const r of rows) {
    const key = `${r.media_type}:${r.tmdb_id}`;
    if (!byTitle.has(key)) byTitle.set(key, { mediaType: r.media_type, tmdbId: r.tmdb_id, title: r.title, rowIds: [] });
    byTitle.get(key).rowIds.push(r.id);
  }

  const titles = [...byTitle.values()].slice(0, LIMIT);
  console.log(`${rows.length} row(s) missing genres across ${byTitle.size} distinct title(s).`);
  if (titles.length < byTitle.size) console.log(`--limit: processing the first ${titles.length}.\n`);
  else console.log('');

  let updatedRows = 0, updatedTitles = 0, noGenres = 0, failed = 0;

  for (const [i, t] of titles.entries()) {
    const ids = await fetchGenreIds(t.mediaType, t.tmdbId);

    if (ids === null) {
      failed++;
      console.log(`  ⚠ lookup failed  ${t.mediaType}/${t.tmdbId}  ${t.title ?? ''} — skipped`);
    } else if (ids.length === 0) {
      noGenres++;
      console.log(`  · no genres      ${t.mediaType}/${t.tmdbId}  ${t.title ?? ''} — TMDB has none, leaving empty`);
    } else {
      if (APPLY) {
        const { error } = await supabase
          .from('list_items')
          .update({ genre_ids: ids })
          .in('id', t.rowIds)
          .eq('genre_ids', '{}');           // belt-and-braces: never clobber a populated row
        if (error) {
          failed++;
          console.log(`  ⚠ write failed   ${t.mediaType}/${t.tmdbId}  ${t.title ?? ''} — ${error.message}`);
          continue;
        }
      }
      updatedTitles++;
      updatedRows += t.rowIds.length;
      console.log(`  ${APPLY ? '✓' : '→'} [${ids.join(', ')}]  ${t.title ?? `${t.mediaType}/${t.tmdbId}`}  (${t.rowIds.length} row${t.rowIds.length === 1 ? '' : 's'})`);
    }

    // TMDB tolerates bursts but this is a one-off; no reason to hammer it.
    if (i < titles.length - 1) await sleep(60);
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'}: ${updatedRows} row(s) across ${updatedTitles} title(s).`);
  if (noGenres) console.log(`Left alone: ${noGenres} title(s) TMDB reports no genres for (re-running will re-check them).`);
  if (failed)   console.log(`Failed: ${failed} title(s) — safe to re-run, nothing was written for those.`);
  if (!APPLY)   console.log('\nRe-run with --apply to write these changes.');
}

main().catch(err => { console.error(err); process.exit(1); });
