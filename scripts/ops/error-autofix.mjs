/**
 * Error -> auto-fix loop driver.
 *
 * Pulls the top recurring PostHog exceptions, and for each one runs Claude Code to
 * propose the smallest correct fix, then opens ONE scoped PR per error for human
 * review. Never merges; never touches protected paths (enforced by agent-pr.mjs).
 *
 * Set DRY_RUN=1 to run the full pipeline (including Claude) but discard instead of
 * pushing/opening PRs — prints the proposed diff + every guard/dedup decision.
 *
 * Env: POSTHOG_PERSONAL_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN (= GH_DISPATCH_TOKEN).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchTopErrors } from './fetch-posthog-errors.mjs';
import {
  git,
  runClaude,
  assertDiffAllowed,
  commitPushAndOpenPr,
  ensureLabel,
  prExistsForMarker,
  remoteBranchExists,
  discardBranch,
} from './lib/agent-pr.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = readFileSync(join(HERE, 'AGENT-error.md'), 'utf8');
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const BASE_BRANCH = process.env.AUTOFIX_BASE_BRANCH || 'main';

function buildPrompt(error) {
  return [
    CONTRACT,
    '',
    '## The exception to fix',
    `- Type: ${error.type}`,
    `- Message: ${error.message}`,
    `- Occurrences (last window): ${error.occurrences}`,
    error.sampleUrl ? `- Sample URL: ${error.sampleUrl}` : '',
    error.lastSeen ? `- Last seen: ${error.lastSeen}` : '',
  ].filter(Boolean).join('\n');
}

function prBody(error) {
  return [
    `Automated fix for a recurring production exception surfaced by PostHog.`,
    '',
    `- **Type:** \`${error.type}\``,
    `- **Message:** ${error.message}`,
    `- **Occurrences (last window):** ${error.occurrences}`,
    error.sampleUrl ? `- **Sample URL:** ${error.sampleUrl}` : '',
    `- **PostHog:** ${error.link}`,
    '',
    '⚠️ Generated automatically — **review before merging.** It is intentionally scoped (protected paths blocked, small diff). Close this PR to suppress re-opening for the same error.',
    '',
    `<!-- posthog-fingerprint: ${error.fingerprint} -->`,
  ].filter(Boolean).join('\n');
}

async function main() {
  const errors = await fetchTopErrors();
  if (!errors.length) {
    console.log('No qualifying errors. Nothing to do.');
    return;
  }

  ensureLabel('automated', '5319e7', 'Opened by an automation loop');
  ensureLabel('error-autofix', 'd93f0b', 'Fix proposed from a PostHog exception');

  for (const error of errors) {
    const branch = `autofix/error-${error.shortFp}`;
    const marker = `posthog-fingerprint: ${error.fingerprint}`;
    console.log(`\n=== ${error.type} (${error.occurrences}x, fp ${error.shortFp}) ===`);

    if (prExistsForMarker(marker)) {
      console.log('Skip: a PR (open or closed) already exists for this fingerprint.');
      continue;
    }
    if (remoteBranchExists(branch)) {
      console.log(`Skip: branch ${branch} already exists on origin.`);
      continue;
    }

    // Fresh branch from base.
    git(['checkout', BASE_BRANCH], { allowFail: true });
    git(['checkout', '-B', branch]);

    let output;
    try {
      output = runClaude(buildPrompt(error));
    } catch (err) {
      console.error(`Claude run failed: ${err.message}`);
      discardBranch(branch, BASE_BRANCH);
      continue;
    }

    if (/(^|\n)\s*NEEDS_HUMAN:/.test(output)) {
      const reason = (output.match(/NEEDS_HUMAN:\s*(.*)/) || [])[1] || '(no reason given)';
      console.log(`Agent declined (NEEDS_HUMAN): ${reason}`);
      discardBranch(branch, BASE_BRANCH);
      continue;
    }

    let diff;
    try {
      diff = assertDiffAllowed();
    } catch (err) {
      console.log(`Guard blocked (${err.guard || 'unknown'}): ${err.message}. Discarding.`);
      discardBranch(branch, BASE_BRANCH);
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
        commitMessage: `fix: ${error.type} (${error.message})`.slice(0, 100),
        title: `fix: ${error.type}`.slice(0, 80),
        body: prBody(error),
        labels: ['automated', 'error-autofix'],
      });
      console.log(`Opened PR: ${url}`);
    } catch (err) {
      console.error(`Failed to open PR: ${err.message}`);
      discardBranch(branch, BASE_BRANCH);
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
