// Import edited copy from the spreadsheet (marketing/preview/out/copy.csv) back to
// the database. Keys each row by `id`, compares every editable field to what the
// post currently holds, and PATCHes only the fields that actually changed (copy is
// merged — alt_text / cta_variant / sources are preserved). Enforces the X limit.
// Pass --dry to preview without writing.
//   node --env-file=.env marketing/preview/copy-import.mjs [--dry]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'out', 'copy.csv');
const u = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!u || !k) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env)'); process.exit(1); }
const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const dry = process.argv.includes('--dry');

// Minimal RFC4180 CSV parser: quoted fields, "" escapes, commas/newlines in quotes.
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Editable columns: header -> {key, parse(cell)->stored value, exported(copy)->cell text}.
const FIELDS = [
  ['X', 'x', (v) => v, (c) => c.x || ''],
  ['Instagram', 'instagram', (v) => v, (c) => c.instagram || ''],
  ['Threads', 'threads', (v) => v, (c) => c.threads || ''],
  ['Article title', 'page_title', (v) => v, (c) => c.page_title || ''],
  ['Hashtags', 'hashtags', (v) => v.split(/\s+/).map((s) => s.replace(/^#/, '')).filter(Boolean), (c) => (c.hashtags || []).join(' ')],
  ['Article body', 'page_body', (v) => v.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean), (c) => (Array.isArray(c.page_body) ? c.page_body.join('\n\n') : (c.page_body || ''))],
];

const grid = parseCSV(readFileSync(FILE, 'utf8').replace(/^﻿/, ''));
const header = grid[0].map((s) => s.trim());
const col = (name) => header.indexOf(name);
const idCol = col('id');
if (idCol < 0) { console.error('No `id` column in copy.csv — re-export with copy-export.mjs'); process.exit(1); }

let changed = 0, warned = 0;
for (const row of grid.slice(1)) {
  const id = row[idCol];
  if (!id) continue;
  const got = await (await fetch(`${u}/rest/v1/marketing_posts?id=eq.${id}&select=copy`, { headers: h })).json();
  if (!got?.[0]) { console.log(`• ${id}: not found, skipped`); continue; }
  const c = got[0].copy || {};
  const patch = {};
  for (const [colName, key, parse, exported] of FIELDS) {
    const ci = col(colName); if (ci < 0) continue;
    const cell = row[ci] ?? '';
    if (cell !== exported(c)) patch[key] = parse(cell);
  }
  if (!Object.keys(patch).length) continue;
  if (patch.x && patch.x.length > 280) { console.warn(`⚠ ${id}: X is ${patch.x.length} chars (>280) — fix before publishing`); warned++; }
  const fieldsList = Object.keys(patch).join(', ');
  console.log(`${dry ? '[dry] ' : ''}✓ ${id}: ${fieldsList}`);
  changed++;
  if (!dry) {
    const merged = { ...c, ...patch };
    await fetch(`${u}/rest/v1/marketing_posts?id=eq.${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ copy: merged, updated_at: new Date().toISOString() }) });
  }
}
console.log(`\n${dry ? '[dry] ' : ''}${changed} post(s) ${dry ? 'would change' : 'updated'}${warned ? `, ${warned} warning(s)` : ''}.`);
