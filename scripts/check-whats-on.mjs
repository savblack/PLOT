#!/usr/bin/env node
// Load theplot.tv/whats-on the way a reader does and fail if it shows no
// articles. Run by .github/workflows/whats-on-health.yml every 30 minutes;
// `pnpm run whats-on:check` runs it by hand. See scripts/lib/whatsOnHealth.mjs.
//
// A bad result is retried before it counts. The 503 "briefly unavailable" page
// is meant to clear on the next request, and a runner's network can blip, so
// only a page that stays broken across every attempt is reported.
//
// Exit 0 healthy, 1 broken. The last line printed is the verdict as JSON, and
// when GITHUB_OUTPUT is set the workflow also gets `ok` and `reason` outputs.
import { appendFileSync } from 'node:fs';
import { classifyWhatsOn } from './lib/whatsOnHealth.mjs';

const URL_TO_CHECK = process.env.WHATS_ON_URL || 'https://theplot.tv/whats-on';
const ATTEMPTS = Math.max(1, Number(process.env.WHATS_ON_ATTEMPTS) || 3);
const WAIT_MS = Math.max(0, Number(process.env.WHATS_ON_WAIT_MS ?? 60_000));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt() {
  try {
    const res = await fetch(URL_TO_CHECK, {
      headers: { 'user-agent': 'plot-whats-on-health-check' },
      signal: AbortSignal.timeout(30_000),
    });
    return { ...classifyWhatsOn(res.status, await res.text()), cache: res.headers.get('x-plot-cache') };
  } catch (err) {
    return { ok: false, reason: `request failed: ${err?.message || err}`, posters: 0, cache: null };
  }
}

let verdict;
for (let i = 1; i <= ATTEMPTS; i++) {
  verdict = await attempt();
  console.log(`attempt ${i}/${ATTEMPTS}: ${verdict.ok ? 'ok' : 'BROKEN'}, ${verdict.reason}${verdict.cache ? ` (cache ${verdict.cache})` : ''}`);
  if (verdict.ok) break;
  if (i < ATTEMPTS) await sleep(WAIT_MS);
}

const result = { url: URL_TO_CHECK, ok: verdict.ok, reason: verdict.reason, posters: verdict.posters, cache: verdict.cache };
console.log(JSON.stringify(result));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `ok=${result.ok}\nreason=${result.reason.replace(/\n/g, ' ')}\n`);
}
process.exit(result.ok ? 0 : 1);
