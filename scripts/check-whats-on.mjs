#!/usr/bin/env node
// Load theplot.tv/whats-on the way a reader does and fail if it shows no
// articles. Run by .github/workflows/whats-on-health.yml every 30 minutes;
// `pnpm run whats-on:check` runs it by hand. See scripts/lib/whatsOnHealth.mjs.
//
// A bad result is retried before it counts. The 503 "briefly unavailable" page
// is meant to clear on the next request, and a runner's network can blip, so
// only a page that stays broken across every attempt is reported.
//
// Cloudflare sometimes turns GitHub's runners away (403 with no X-Plot-Cache).
// That says nothing about the page, so a blocked attempt is retried and never
// counts as broken. One readable attempt is enough to judge; if every attempt
// is blocked the run is "blocked": a warning, no alarm, and no stand-down.
//
// Exit 0 healthy or blocked, 1 broken. The last line printed is the verdict as
// JSON, and when GITHUB_OUTPUT is set the workflow also gets `state`
// (healthy | broken | blocked) and `reason`.
import { appendFileSync } from 'node:fs';
import { classifyWhatsOn } from './lib/whatsOnHealth.mjs';

const URL_TO_CHECK = process.env.WHATS_ON_URL || 'https://theplot.tv/whats-on';
const ATTEMPTS = Math.max(1, Number(process.env.WHATS_ON_ATTEMPTS) || 4);
const WAIT_MS = Math.max(0, Number(process.env.WHATS_ON_WAIT_MS ?? 60_000));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt() {
  try {
    const res = await fetch(URL_TO_CHECK, {
      headers: { 'user-agent': 'plot-whats-on-health-check' },
      signal: AbortSignal.timeout(30_000),
    });
    const cache = res.headers.get('x-plot-cache');
    const edge = { fromPlot: cache !== null, mitigated: res.headers.get('cf-mitigated') };
    return { ...classifyWhatsOn(res.status, await res.text(), edge), cache };
  } catch (err) {
    return { ok: false, reason: `request failed: ${err?.message || err}`, posters: 0, cache: null };
  }
}

let verdict;
let lastBroken = null;
for (let i = 1; i <= ATTEMPTS; i++) {
  verdict = await attempt();
  const label = verdict.ok ? 'ok' : verdict.blocked ? 'blocked' : 'BROKEN';
  console.log(`attempt ${i}/${ATTEMPTS}: ${label}, ${verdict.reason}${verdict.cache ? ` (cache ${verdict.cache})` : ''}`);
  if (verdict.ok) break;
  if (!verdict.blocked) lastBroken = verdict;
  if (i < ATTEMPTS) await sleep(WAIT_MS);
}

// Healthy if any attempt read a good page; broken if one read a bad page and
// none read a good one; blocked if Cloudflare refused every attempt.
const final = verdict.ok ? verdict : lastBroken || verdict;
const state = final.ok ? 'healthy' : final.blocked ? 'blocked' : 'broken';
const result = { url: URL_TO_CHECK, state, reason: final.reason, posters: final.posters, cache: final.cache };
console.log(JSON.stringify(result));
if (state === 'blocked') {
  console.log(`::warning title=What's On check could not read the page::${final.reason} on all ${ATTEMPTS} attempts. Not an outage signal either way.`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\nreason=${result.reason.replace(/\n/g, ' ')}\n`);
}
process.exit(state === 'broken' ? 1 : 0);
