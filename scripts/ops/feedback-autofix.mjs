/**
 * Feedback / bug-report -> auto-fix loop driver.
 *
 * Reads new Linear bug issues in the PLOT Feedback project, triages each with a
 * read-only Claude pass, and for the reproducible in-scope subset runs Claude to
 * open ONE scoped fix PR linked to the issue. Everything else is labelled
 * `autofix:needs-human` with a triage comment. Never merges; never touches
 * protected paths (enforced by agent-pr.mjs).
 *
 * Linear `autofix:*` labels are the state store: any such label removes an issue
 * from future runs (see lib/linear.mjs fetchOpenBugIssues).
 *
 * Set DRY_RUN=1 to run triage (+ fix attempt) but mutate nothing in Linear/GitHub.
 *
 * Env: LINEAR_API_KEY, LINEAR_FEEDBACK_TEAM_ID, CLAUDE_CODE_OAUTH_TOKEN,
 *      GH_TOKEN (= GH_DISPATCH_TOKEN).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchOpenBugIssues,
  resolveTeamId,
  ensureLabelId,
  addLabelToIssue,
  commentOnIssue,
} from './lib/linear.mjs';
import {
  git,
  runClaude,
  assertDiffAllowed,
  commitPushAndOpenPr,
  ensureLabel,
  remoteBranchExists,
  discardBranch,
} from './lib/agent-pr.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRIAGE_CONTRACT = readFileSync(join(HERE, 'AGENT-feedback-triage.md'), 'utf8');
const FIX_CONTRACT = readFileSync(join(HERE, 'AGENT-feedback-fix.md'), 'utf8');
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const BASE_BRANCH = process.env.AUTOFIX_BASE_BRANCH || 'main';
const MAX_PER_RUN = Number(process.env.FEEDBACK_MAX_PER_RUN || 1);

const VALID_VERDICTS = ['reproducible-bug', 'feature-request', 'needs-info', 'user-error', 'out-of-scope'];

function issueBlock(issue) {
  return [
    '## The bug report',
    `- Linear issue: ${issue.identifier}`,
    `- Title: ${issue.title}`,
    '',
    '### Description',
    (issue.description || '(no description)').trim(),
  ].join('\n');
}

function parseVerdict(output) {
  const match = output.match(/VERDICT:\s*([a-z-]+)\s*(?:[—–-]\s*(.*))?/i);
  if (!match) return { verdict: null, reason: '' };
  const verdict = match[1].toLowerCase();
  return { verdict: VALID_VERDICTS.includes(verdict) ? verdict : null, reason: (match[2] || '').trim() };
}

function prBody(issue) {
  return [
    `Automated fix for a user-reported bug.`,
    '',
    `- **Linear issue:** [${issue.identifier}](${issue.url})`,
    `- **Report:** ${issue.title}`,
    '',
    `Fixes ${issue.identifier}`,
    '',
    '⚠️ Generated automatically — **review before merging.** Intentionally scoped (protected paths blocked, small diff).',
  ].join('\n');
}

async function main() {
  const teamId = await resolveTeamId(process.env.LINEAR_FEEDBACK_TEAM_ID);
  const issues = (await fetchOpenBugIssues()).slice(0, MAX_PER_RUN);
  if (!issues.length) {
    console.log('No unprocessed bug issues. Nothing to do.');
    return;
  }

  // Resolve/create the Linear state labels once.
  const labelIds = DRY_RUN ? {} : {
    needsHuman: await ensureLabelId('autofix:needs-human', { teamId, color: '#f2c94c' }),
    prOpen: await ensureLabelId('autofix:pr-open', { teamId, color: '#4cb782' }),
  };

  if (!DRY_RUN) {
    ensureLabel('automated', '5319e7', 'Opened by an automation loop');
    ensureLabel('feedback-autofix', '0e8a16', 'Fix proposed from a Linear bug report');
  }

  const flagForHuman = async (issue, note) => {
    console.log(`-> needs-human: ${note}`);
    if (DRY_RUN) return;
    await addLabelToIssue(issue.id, labelIds.needsHuman);
    await commentOnIssue(issue.id, `🤖 Auto-triage: ${note}`);
  };

  for (const issue of issues) {
    const branch = `autofix/feedback-${issue.identifier.toLowerCase()}`;
    console.log(`\n=== ${issue.identifier}: ${issue.title} ===`);

    if (remoteBranchExists(branch)) {
      console.log(`Skip: branch ${branch} already exists on origin.`);
      continue;
    }

    // --- Phase 1: read-only triage ---
    git(['checkout', BASE_BRANCH], { allowFail: true });
    git(['reset', '--hard'], { allowFail: true });
    git(['clean', '-fd'], { allowFail: true });

    let triageOut;
    try {
      triageOut = runClaude(`${TRIAGE_CONTRACT}\n\n${issueBlock(issue)}`, { allowedTools: 'Read,Grep,Glob,Bash' });
    } catch (err) {
      console.error(`Triage run failed: ${err.message}`);
      continue;
    }
    // Discard anything the read-only pass may have touched.
    git(['reset', '--hard'], { allowFail: true });
    git(['clean', '-fd'], { allowFail: true });

    const { verdict, reason } = parseVerdict(triageOut);
    console.log(`Verdict: ${verdict || 'unparseable'} — ${reason}`);

    if (verdict !== 'reproducible-bug') {
      await flagForHuman(issue, `classified as ${verdict || 'unclear'}. ${reason}`.trim());
      continue;
    }

    // --- Phase 2: fix ---
    git(['checkout', '-B', branch]);
    let fixOut;
    try {
      fixOut = runClaude(`${FIX_CONTRACT}\n\n${issueBlock(issue)}`);
    } catch (err) {
      console.error(`Fix run failed: ${err.message}`);
      discardBranch(branch, BASE_BRANCH);
      await flagForHuman(issue, 'automated fix attempt errored; needs a human.');
      continue;
    }

    if (/(^|\n)\s*NEEDS_HUMAN:/.test(fixOut)) {
      const r = (fixOut.match(/NEEDS_HUMAN:\s*(.*)/) || [])[1] || '(no reason)';
      discardBranch(branch, BASE_BRANCH);
      await flagForHuman(issue, `agent declined to fix: ${r}`);
      continue;
    }

    let diff;
    try {
      diff = assertDiffAllowed();
    } catch (err) {
      console.log(`Guard blocked (${err.guard || 'unknown'}): ${err.message}.`);
      discardBranch(branch, BASE_BRANCH);
      await flagForHuman(issue, `proposed fix blocked by safety guard (${err.guard || 'unknown'}).`);
      continue;
    }

    console.log(`Proposed fix: ${diff.files.length} file(s), ${diff.lines} line(s): ${diff.files.join(', ')}`);

    if (DRY_RUN) {
      console.log('--- DRY RUN diff ---');
      console.log(git(['diff', '--cached']).stdout);
      discardBranch(branch, BASE_BRANCH);
      continue;
    }

    try {
      const url = commitPushAndOpenPr({
        branch,
        baseBranch: BASE_BRANCH,
        commitMessage: `fix: ${issue.title}`.slice(0, 100),
        title: `fix: ${issue.title}`.slice(0, 80),
        body: prBody(issue),
        labels: ['automated', 'feedback-autofix'],
      });
      console.log(`Opened PR: ${url}`);
      await addLabelToIssue(issue.id, labelIds.prOpen);
      await commentOnIssue(issue.id, `🤖 Opened an automated fix PR for review: ${url}`);
    } catch (err) {
      console.error(`Failed to open PR: ${err.message}`);
      discardBranch(branch, BASE_BRANCH);
      await flagForHuman(issue, 'fix was ready but opening the PR failed; needs a human.');
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
