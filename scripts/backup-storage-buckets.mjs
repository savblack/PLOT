#!/usr/bin/env node
/**
 * Download every Supabase Storage object into a local directory tree, so the
 * caller can mirror it to R2.
 *
 * WHY: `pg_dump` captures `storage.objects` METADATA, not object bytes. A
 * database restore therefore rebuilds rows pointing at avatars and marketing
 * images that no longer exist. The nightly DB backup has always had this hole;
 * it was found on 2026-08-14 while restore-testing.
 *
 * Unchanged objects are skipped when a previous `_manifest.json` is present.
 * The nightly job used to re-download the whole bucket (~80 MB) every run,
 * which is Supabase egress, not R2. A quiet night now costs a list call.
 *
 * This deliberately uses the Storage REST API with the service-role key rather
 * than Supabase's S3-compatible endpoint, because the latter needs a separate
 * pair of S3 access keys generated in the dashboard, and there is no reason to
 * mint new long-lived credentials for a job that already has a service key.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage-buckets.mjs <outdir>
 *   node scripts/backup-storage-buckets.mjs <outdir> --dry-run
 *
 * Layout written:  <outdir>/<bucket>/<object path>
 * Manifest:        <outdir>/_manifest.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
// Serial downloads take well over two minutes for ~370 objects, which is slow
// enough to look hung. 8 is comfortable for Supabase Storage and keeps memory
// flat since each file is written before the next slot starts.
const CONCURRENCY = arg('concurrency', 8);
// Testing aid: cap the number of objects per bucket.
const LIMIT = arg('limit', Infinity);

const MANIFEST_NAME = '_manifest.json';

/** @param {string} bucket @param {string} path */
export function manifestKey(bucket, path) {
  return `${bucket}/${path}`;
}

/**
 * True when the remote object is missing from the last backup or its size /
 * updated_at changed. Same-size overwrites still download because avatars
 * reuse a path.
 *
 * @param {{size?: number, updated_at?: string}|undefined} prev
 * @param {{size: number, updated_at: string}} obj
 */
export function needsDownload(prev, obj) {
  if (!prev) return true;
  return Number(prev.size) !== Number(obj.size) || String(prev.updated_at || '') !== String(obj.updated_at || '');
}

export function readManifestSync(text) {
  if (!text) return {};
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

async function loadManifest(dir) {
  try {
    return readManifestSync(await readFile(join(dir, MANIFEST_NAME), 'utf8'));
  } catch {
    return {};
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isCli) {
  // Imported by tests. The CLI path below talks to Storage.
} else {
  await runCli();
}

async function runCli() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!OUT) {
    console.error('usage: backup-storage-buckets.mjs <outdir> [--dry-run]');
    process.exit(1);
  }
  if (!SUPABASE_URL || !KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) are required');
    process.exit(1);
  }

  const base = SUPABASE_URL.replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${KEY}`, apikey: KEY };

  async function api(path, init = {}) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...auth, ...(init.headers || {}) },
    });
    if (!res.ok) {
      throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
    }
    return res;
  }

  async function listBuckets() {
    return (await (await api('/storage/v1/bucket')).json()).map((b) => b.name);
  }

  /**
   * The list endpoint returns one directory level at a time: entries with a null
   * `id` are prefixes, not objects, so they have to be walked. Flattening only the
   * top level silently misses every nested file, which for `marketing/` is most
   * of them.
   */
  async function listObjects(bucket, prefix = '') {
    const out = [];
    const PAGE = 100;
    for (let offset = 0; ; offset += PAGE) {
      const res = await api(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      const page = await res.json();
      if (!page.length) break;
      for (const entry of page) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          out.push(...(await listObjects(bucket, path)));
        } else {
          out.push({
            path,
            size: Number(entry.metadata?.size ?? 0),
            updated_at: entry.updated_at || '',
          });
        }
      }
      if (page.length < PAGE) break;
    }
    return out;
  }

  async function download(bucket, path) {
    const res = await api(
      `/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,
    );
    return Buffer.from(await res.arrayBuffer());
  }

  const previous = await loadManifest(OUT);
  const nextManifest = {};
  const buckets = await listBuckets();
  console.log(`buckets: ${buckets.join(', ') || '(none)'}`);

  let files = 0;
  let skipped = 0;
  let bytes = 0;
  let failures = 0;

  /** Run `worker` over `items` with a fixed number of slots. */
  async function pool(items, size, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i]);
      }
    });
    await Promise.all(runners);
  }

  for (const bucket of buckets) {
    const all = await listObjects(bucket);
    const objects = all.slice(0, LIMIT);
    console.log(
      `${bucket}: ${all.length} objects${objects.length !== all.length ? ` (limited to ${objects.length})` : ''}`,
    );

    for (const obj of objects) {
      nextManifest[manifestKey(bucket, obj.path)] = { size: obj.size, updated_at: obj.updated_at };
    }

    const changed = objects.filter((obj) => needsDownload(previous[manifestKey(bucket, obj.path)], obj));
    skipped += objects.length - changed.length;

    if (DRY_RUN) {
      files += changed.length;
      bytes += changed.reduce((n, o) => n + o.size, 0);
      continue;
    }

    await pool(changed, CONCURRENCY, async (obj) => {
      const dest = join(OUT, bucket, obj.path);
      try {
        const buf = await download(bucket, obj.path);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, buf);
        files += 1;
        bytes += buf.length;
      } catch (err) {
        // Keep going: one unreadable object must not cost us the other 367.
        // Exit non-zero at the end so the workflow still fails and alerts.
        failures += 1;
        console.error(`FAILED ${bucket}/${obj.path}: ${err.message}`);
      }
    });
  }

  if (!DRY_RUN) {
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, MANIFEST_NAME), `${JSON.stringify(nextManifest)}\n`);
  }

  console.log(
    `${DRY_RUN ? '[dry-run] would download' : 'downloaded'} ${files} objects, ${(bytes / 1048576).toFixed(1)} MiB` +
      (skipped ? `, skipped ${skipped} unchanged` : '') +
      (failures ? `, ${failures} FAILED` : ''),
  );
  if (failures) process.exit(1);
}
