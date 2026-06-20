// Export this week's editable copy to a spreadsheet (CSV) for bulk editing.
// One row per active post; edit the copy columns in Excel / Numbers / Sheets,
// save, then run copy-import.mjs to sync changes back to the database. Read-only.
//   node --env-file=.env marketing/preview/copy-export.mjs  ->  marketing/preview/out/copy.csv
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });
const u = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!u || !k) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env)'); process.exit(1); }
const h = { apikey: k, Authorization: `Bearer ${k}` };
const day = (iso) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';

const rows = await (await fetch(`${u}/rest/v1/marketing_posts?status=in.(needs_review,approved,vetoed)&select=id,post_type,scheduled_for,status,copy&order=scheduled_for`, { headers: h })).json();
// id/type/day/status are read-only context (import keys on id, ignores the rest).
// Editable columns: X, Instagram, Hashtags, Threads, Article title, Article body.
const cols = ['id', 'type', 'day', 'status', 'X', 'Instagram', 'Hashtags', 'Threads', 'Article title', 'Article body'];
let csv = '﻿' + cols.join(',') + '\n';
for (const p of rows) {
  const c = p.copy || {};
  const body = Array.isArray(c.page_body) ? c.page_body.join('\n\n') : (c.page_body || '');
  csv += [q(p.id), q(p.post_type), q(day(p.scheduled_for)), q(p.status), q(c.x), q(c.instagram), q((c.hashtags || []).join(' ')), q(c.threads), q(c.page_title), q(body)].join(',') + '\n';
}
writeFileSync(join(OUT, 'copy.csv'), csv);
console.log(`Wrote ${join(OUT, 'copy.csv')} (${rows.length} posts). Edit the copy columns, save, then: node --env-file=.env marketing/preview/copy-import.mjs`);
