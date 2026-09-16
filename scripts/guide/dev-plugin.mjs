// Local source adapter. Production hosting will use the same snapshot contract.
import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { GUIDE_REGIONS, validateGuideSnapshot } from '../../packages/core/broadcastGuide.js';
const run = promisify(execFile);
const pending = new Map();
const lastAttempt = new Map();
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function refresh(region) {
  if (pending.has(region)) return pending.get(region);
  // Avoid hammering an unavailable source on every retry or page visit.
  if (Date.now() - (lastAttempt.get(region) ?? 0) < 60_000) throw new Error('Refresh cooling down');
  lastAttempt.set(region, Date.now());
  const task = run('python3', [fileURLToPath(new URL('./import-feed.py', import.meta.url)), region], { timeout: 240_000 })
    .finally(() => pending.delete(region));
  pending.set(region, task);
  return task;
}

export function guidePreviewFeed() {
  return {
    name: 'plot-guide-preview-feed',
    configureServer(server) {
      server.middlewares.use('/__guide-preview', async (req, res) => {
        const region = new URL(req.url, 'http://localhost').searchParams.get('region');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        if (!GUIDE_REGIONS.some(item => item.id === region && item.provider)) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Unknown guide region' }));
        }
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Allow', 'GET');
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        const file = new URL(`../../.guide-cache/${region}.json`, import.meta.url);
        try {
          let snapshot = null;
          let fresh = false;
          try {
            snapshot = validateGuideSnapshot(JSON.parse(await readFile(file, 'utf8')), region);
            fresh = snapshot.schemaVersion === 2 && Date.parse(snapshot.coverageEnd) > Date.now() && Date.now() - (await stat(file)).mtimeMs < SIX_HOURS;
          } catch { /* Invalid or missing snapshots require a fresh import. */ }
          let refreshFailed = false;
          if (!fresh) {
            try {
              await refresh(region);
              snapshot = validateGuideSnapshot(JSON.parse(await readFile(file, 'utf8')), region);
            } catch {
              refreshFailed = true;
            }
          }
          if (!snapshot) throw new Error('No valid snapshot');
          res.end(JSON.stringify({ ...snapshot, refreshFailed }));
        } catch {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'Schedule temporarily unavailable' }));
        }
      });
    },
  };
}
