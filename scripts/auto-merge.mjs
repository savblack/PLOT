#!/usr/bin/env node
/**
 * Merges agent fixes that Savannah has agreed may go live on their own.
 * Run by .github/workflows/auto-merge.yml every 15 minutes.
 *
 * A candidate is an open, non-draft PR labelled `agent-fix` from an `agent/`
 * branch. It merges (squash) only when ALL of these hold:
 *   - scripts/lib/autoMergePolicy.mjs allows every file it changes
 *   - every check and status on the head commit finished green, and the two
 *     that matter ran: the CircleCI check and the Strix security review
 *   - no review thread is left unresolved
 *   - GitHub reports it mergeable with no conflict
 * A PR the policy refuses is labelled `needs-savannah` with the reasons, once.
 * A merged PR is labelled `auto-merged`, which the daily report reads.
 *
 * Env: GITHUB_REPOSITORY, READ_TOKEN (the workflow token, for reads, labels
 * and comments), MERGE_TOKEN (a fine-grained token that can merge; a merge by
 * the workflow token would not start the deploy workflows on main). Without
 * MERGE_TOKEN it reports what it would merge and merges nothing.
 */
import { decide } from './lib/autoMergePolicy.mjs';

const REPO = process.env.GITHUB_REPOSITORY;
const READ = process.env.READ_TOKEN;
const MERGE = process.env.MERGE_TOKEN || '';
const API = 'https://api.github.com';
const REQUIRED = ['ci/circleci: check', 'Strix Security Review'];
const GREEN = new Set(['success', 'neutral', 'skipped']);

async function gh(path, { token = READ, method = 'GET', body } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'plot-auto-merge',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

async function all(path) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const rows = await gh(`${path}${sep}per_page=100&page=${page}`);
    const list = Array.isArray(rows) ? rows : rows.check_runs;
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}

/** Every check run and commit status on the head, collapsed to name -> outcome. */
export async function checkState(sha) {
  const runs = await all(`/repos/${REPO}/commits/${sha}/check-runs`);
  const statuses = (await gh(`/repos/${REPO}/commits/${sha}/status`)).statuses;
  const outcome = new Map();
  for (const r of runs) outcome.set(r.name, r.status === 'completed' ? r.conclusion : 'pending');
  for (const s of statuses) outcome.set(s.context, s.state === 'success' ? 'success' : s.state);
  const pending = [...outcome].filter(([, v]) => v === 'pending').map(([k]) => k);
  const failed = [...outcome].filter(([, v]) => v !== 'pending' && !GREEN.has(v)).map(([k, v]) => `${k} (${v})`);
  const missing = REQUIRED.filter((name) => outcome.get(name) !== 'success' && !pending.includes(name) && !failed.some((f) => f.startsWith(name)));
  return { pending, failed, missing };
}

async function unresolvedThreads(number) {
  const [owner, name] = REPO.split('/');
  const query = `query($o:String!,$n:String!,$p:Int!){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100){nodes{isResolved}}}}}`;
  const data = await gh('/graphql', { method: 'POST', body: { query, variables: { o: owner, n: name, p: number } } });
  return data.data.repository.pullRequest.reviewThreads.nodes.filter((t) => !t.isResolved).length;
}

async function label(number, name) {
  await gh(`/repos/${REPO}/issues/${number}/labels`, { method: 'POST', body: { labels: [name] } });
}

async function main() {
  const prs = await all(`/repos/${REPO}/pulls?state=open`);
  const candidates = prs.filter((p) => !p.draft
    && p.head.ref.startsWith('agent/')
    && p.head.repo?.full_name === REPO
    && p.labels.some((l) => l.name === 'agent-fix'));
  console.log(`${candidates.length} candidate PR(s)${MERGE ? '' : ' (no MERGE_TOKEN: report only)'}`);

  for (const pr of candidates) {
    const n = pr.number;
    const labels = pr.labels.map((l) => l.name);
    const files = await all(`/repos/${REPO}/pulls/${n}/files`);
    const verdict = decide(files);
    if (!verdict.allowed) {
      console.log(`#${n}: waits for Savannah: ${verdict.reasons.join('; ')}`);
      if (!labels.includes('needs-savannah')) {
        await label(n, 'needs-savannah');
        await gh(`/repos/${REPO}/issues/${n}/comments`, {
          method: 'POST',
          body: { body: `This fix needs Savannah's OK before it goes live, so it will not merge on its own:\n\n${verdict.reasons.map((r) => `- ${r}`).join('\n')}` },
        });
      }
      continue;
    }

    const full = await gh(`/repos/${REPO}/pulls/${n}`);
    const checks = await checkState(full.head.sha);
    const threads = await unresolvedThreads(n);
    const blockers = [
      ...checks.pending.map((c) => `waiting on ${c}`),
      ...checks.failed.map((c) => `failed: ${c}`),
      ...checks.missing.map((c) => `has not run: ${c}`),
      ...(threads ? [`${threads} unresolved review thread(s)`] : []),
      ...(full.mergeable === false || full.mergeable_state === 'dirty' ? ['merge conflict'] : []),
      ...(full.mergeable === null ? ['GitHub is still computing mergeability'] : []),
    ];
    if (blockers.length) {
      console.log(`#${n}: allowed (${verdict.kinds.join(', ')}) but not ready: ${blockers.join('; ')}`);
      continue;
    }
    if (!MERGE) {
      console.log(`#${n}: would merge (${verdict.kinds.join(', ')}); set AUTO_MERGE_TOKEN to enable`);
      continue;
    }
    await gh(`/repos/${REPO}/pulls/${n}/merge`, {
      token: MERGE,
      method: 'PUT',
      body: { merge_method: 'squash', sha: full.head.sha },
    });
    await label(n, 'auto-merged');
    console.log(`#${n}: merged (${verdict.kinds.join(', ')})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
