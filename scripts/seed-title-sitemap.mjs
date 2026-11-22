#!/usr/bin/env node
// Weekly title seed. Alix supplies verified TMDB IDs in a JSON array:
//   node scripts/seed-title-sitemap.mjs --file /path/to/thursday.json
//   node scripts/seed-title-sitemap.mjs --file /path/to/thursday.json --apply
// Without --file, the checked-in Week 1 list is used. Preview is the default;
// --apply writes to the configured Supabase project. Do not run against live
// projects without Savannah's approval. Use server-side credentials only.
// SQL fallback (run in the approved project's SQL editor):
// INSERT INTO public.marketing_tracked_titles (media_type, tmdb_id, title)
// VALUES ('movie', 1421903, 'Werwulf')
// ON CONFLICT (media_type, tmdb_id) DO UPDATE SET title = EXCLUDED.title;
// The daily run_title_sitemap_refresh includes new rows. For an urgent refresh,
// an authorized operator can run SELECT public.run_title_sitemap_refresh();
// in the approved project's SQL editor. Wait for title_sitemap_cache.generated_at
// to advance, then purge https://theplot.tv/sitemap-titles.xml from Cloudflare's
// cache if the new URLs must be visible immediately. Otherwise allow the public
// Pages cache up to one day to expire.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
if (args.some((arg) => !['--apply', '--file'].includes(arg) && (fileArg < 0 || args[fileArg + 1] !== arg)) || (fileArg >= 0 && !args[fileArg + 1])) {
  throw new Error('Usage: node scripts/seed-title-sitemap.mjs [--file titles.json] [--apply]');
}
const input = fileArg >= 0 ? args[fileArg + 1] : fileURLToPath(new URL('./title-sitemap-week1.json', import.meta.url));
const titles = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(titles) || !titles.length) throw new Error('Input must be a nonempty JSON array.');
const seen = new Set();
const rows = titles.map((title) => {
  const { media_type, tmdb_id, release_date } = title;
  if (!['movie', 'tv'].includes(media_type) || !Number.isSafeInteger(tmdb_id) || tmdb_id <= 0 || typeof title.title !== 'string' || !title.title.trim()) {
    throw new Error('Each title needs media_type, a positive TMDB ID, and a title.');
  }
  if (release_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(release_date)) throw new Error('release_date must be YYYY-MM-DD.');
  const key = `${media_type}:${tmdb_id}`;
  if (seen.has(key)) throw new Error(`Duplicate input: ${key}`);
  seen.add(key);
  return { media_type, tmdb_id, title: title.title.trim(), ...(release_date ? { release_date } : {}) };
});

if (!args.includes('--apply')) {
  console.log(`Preview: ${rows.length} verified TMDB titles ready for upsert. Pass --apply after approval.`);
} else {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from('marketing_tracked_titles').upsert(rows, { onConflict: 'media_type,tmdb_id' });
  if (error) throw new Error(`Title upsert failed: ${error.message}`);
  console.log(`Upserted ${rows.length} tracked titles. The next daily sitemap refresh will include them.`);
}
