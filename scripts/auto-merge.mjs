#!/usr/bin/env node
/**
 * Merges agent fixes that Savannah has agreed may go live on their own.
 * Run by .github/workflows/auto-merge.yml every 15 minutes.
 *
 * A candidate is an open, non-draft PR labelled `agent-fix` from an `agent/`
 * branch. It merges (squash) only when ALL of these hold:
 *   - scripts/lib/autoMergePolicy.mjs allows every file it changes
 *   - every check and status on the head commit finished green, and the two
 *     that matter ran: the CircleCI check and GitHub's CodeQL security scan
 *     (Strix was the reviewer until its trial ended on 2026-11-12)
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
const GREEN = new Set(['success', 'neutral', 'skipped']);
// Each required check is trusted only from its real source, so a job, a
// status or a check run that merely borrows the name cannot satisfy it.
const REQUIRED = [
  // GitHub's own code scanning summary. Only GitHub posts under this app, so a
  // workflow job named "CodeQL" (app github-actions) does not count.
  { name: 'CodeQL', kind: 'check', app: 'github-advanced-security' },
  // CircleCI's GitHub App. It also mirrors the status under Savannah's own
  // account, which agents act as, so that copy is not trusted.
  { name: 'ci/circleci: check', kind: 'status', creator: 'circleci-app[bot]' },
];

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

/**
 * Every check run and commit status on the head. Any entry with a required
 * name that is not green fails the PR, whoever posted it; a required check
 * passes only if its real source reported success.
 */
export function judgeChecks(runs, statuses) {
  const pending = [];
  const failed = [];
  for (const r of runs) {
    if (r.status !== 'completed') pending.push(r.name);
    else if (!GREEN.has(r.conclusion)) failed.push(`${r.name} (${r.conclusion})`);
  }
  // statuses: newest first; judge only the latest per context per creator.
  const seen = new Set();
  for (const st of statuses) {
    const key = `${st.context}|${st.creator?.login ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (st.state === 'pending') pending.push(st.context);
    else if (st.state !== 'success') failed.push(`${st.context} (${st.state})`);
  }
  const missing = [];
  for (const req of REQUIRED) {
    const ok = req.kind === 'check'
      ? runs.some((r) => r.name === req.name && r.app?.slug === req.app && r.status === 'completed' && r.conclusion === 'success')
      : statuses.find((st) => st.context === req.name && (st.creator?.login ?? null) === req.creator)?.state === 'success';
    if (!ok && !pending.includes(req.name)) missing.push(req.name);
  }
  return { pending: [...new Set(pending)], failed: [...new Set(failed)], missing };
}

export async function checkState(sha) {
  const runs = await all(`/repos/${REPO}/commits/${sha}/check-runs?filter=all`);
  const statuses = await all(`/repos/${REPO}/commits/${sha}/statuses`);
  return judgeChecks(runs, statuses);
}

async function unresolvedThreads(number) {
  const [owner, name] = REPO.split('/');
  const query = `query($o:String!,$n:String!,$p:Int!){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved}}}}}`;
  const data = await gh('/graphql', { method: 'POST', body: { query, variables: { o: owner, n: name, p: number } } });
  const threads = data.data.repository.pullRequest.reviewThreads;
  // Over 100 threads is treated as unresolved rather than read partly.
  return threads.pageInfo.hasNextPage ? Infinity : threads.nodes.filter((t) => !t.isResolved).length;
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

  let errors = 0;
  for (const pr of candidates) {
    try {
      await consider(pr);
    } catch (err) {
      errors++;
      console.error(`#${pr.number}: ${err.message}`);
    }
  }
  if (errors) process.exitCode = 1;
}

async function consider(pr) {
  const n = pr.number;
  const labels = pr.labels.map((l) => l.name);
  // Pin the head first, read the files, then confirm the head did not move:
  // the files judged are then exactly the commit that would merge.
  const full = await gh(`/repos/${REPO}/pulls/${n}`);
  const sha = full.head.sha;
  const files = await all(`/repos/${REPO}/pulls/${n}/files`);
  const verdict = decide(files, full.changed_files);
  if (!verdict.allowed) {
    console.log(`#${n}: waits for Savannah: ${verdict.reasons.join('; ')}`);
    if (!labels.includes('needs-savannah')) {
      await label(n, 'needs-savannah');
      await gh(`/repos/${REPO}/issues/${n}/comments`, {
        method: 'POST',
        body: { body: `This fix needs Savannah's OK before it goes live, so it will not merge on its own:\n\n${verdict.reasons.map((r) => `- ${r}`).join('\n')}` },
      });
    }
    return;
  }

  const checks = await checkState(sha);
  const threads = await unresolvedThreads(n);
  const again = await gh(`/repos/${REPO}/pulls/${n}`);
  const blockers = [
    ...(again.head.sha !== sha ? ['new commits arrived while it was being checked'] : []),
    ...checks.pending.map((c) => `waiting on ${c}`),
    ...checks.failed.map((c) => `failed: ${c}`),
    ...checks.missing.map((c) => `has not run from its real source: ${c}`),
    ...(threads ? [`${threads === Infinity ? 'over 100' : threads} unresolved review thread(s)`] : []),
    // clean only: not behind main (untested on top of it), not conflicting, not blocked.
    ...(again.mergeable_state !== 'clean' ? [`GitHub reports it ${again.mergeable_state ?? 'not yet computed'}`] : []),
  ];
  if (blockers.length) {
    console.log(`#${n}: allowed (${verdict.kinds.join(', ')}) but not ready: ${blockers.join('; ')}`);
    return;
  }
  if (!MERGE) {
    console.log(`#${n}: would merge (${verdict.kinds.join(', ')}); set AUTO_MERGE_TOKEN to enable`);
    return;
  }
  // `sha` makes GitHub refuse the merge if the head moved after this point.
  await gh(`/repos/${REPO}/pulls/${n}/merge`, { token: MERGE, method: 'PUT', body: { merge_method: 'squash', sha } });
  console.log(`#${n}: merged (${verdict.kinds.join(', ')})`);
  await label(n, 'auto-merged');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
