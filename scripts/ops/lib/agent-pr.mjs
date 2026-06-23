/**
 * Shared helpers for the autonomous fix loops (error-autofix, feedback-autofix).
 *
 * The load-bearing safety boundary lives here: ENFORCING_GUARD. The prompt given
 * to Claude *asks* it to avoid protected paths, but prompts are advisory. The real
 * guarantee is `assertDiffAllowed()` — after Claude edits the tree we inspect the
 * actual changed files and DISCARD everything if any protected path was touched or
 * the diff is too large. Nothing reaches a PR unless it passes this gate.
 *
 * No third-party deps: relies on `git`, `gh`, and `claude` being on PATH (they are
 * on GitHub-hosted runners + after `npm i -g @anthropic-ai/claude-code`).
 */

import { spawnSync } from 'node:child_process';

/**
 * Paths an automated fix may NEVER touch. Auth, sessions, account lifecycle,
 * data export/deletion, payments, and the CI/secrets surface itself.
 * Kept deliberately broad — false positives just send a fix to a human.
 */
// Bare substrings (not word-anchored) so camelCase like `useSession.js` is still
// caught. Over-blocking is fine — a false positive just routes the fix to a human.
export const PROTECTED_PATH_REGEX = new RegExp(
  [
    '^supabase/functions/delete-account/',
    '^supabase/functions/export-user-data/',
    'auth',
    'session',
    'account',
    'login',
    'signup',
    'password',
    'token',
    'credential',
    '/delete',
    '/export',
    '^\\.github/',          // never let a fix rewrite workflows or CI
    '\\.env',
    'dependabot',
  ].join('|'),
  'i',
);

// Scope caps — an automated fix must stay small enough to review at a glance.
export const MAX_DIFF_LINES = Number(process.env.AUTOFIX_MAX_DIFF_LINES || 80);
export const MAX_DIFF_FILES = Number(process.env.AUTOFIX_MAX_DIFF_FILES || 4);

export function sh(command, args, { allowFail = false, env = process.env, input } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFail) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`\`${command} ${args.join(' ')}\` failed (${result.status}): ${detail}`);
  }
  return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

export function git(args, opts = {}) {
  return sh('git', args, opts);
}

/** Discard ALL working-tree changes and return to baseBranch, deleting `branch`. */
export function discardBranch(branch, baseBranch = 'main') {
  git(['reset', '--hard'], { allowFail: true });
  git(['clean', '-fd'], { allowFail: true });
  git(['checkout', baseBranch], { allowFail: true });
  if (branch) git(['branch', '-D', branch], { allowFail: true });
}

/**
 * Run Claude Code headless against the checked-out repo. Mirrors the working
 * invocation in marketing/scripts/automation.mjs. CLAUDE_CODE_OAUTH_TOKEN is read
 * from the environment by the CLI. Returns the captured stdout (the agent's text).
 */
export function runClaude(prompt, { allowedTools = 'Bash,Read,Edit,Grep,Glob', timeoutMs = 15 * 60 * 1000 } = {}) {
  const result = spawnSync(
    'claude',
    ['-p', '--permission-mode', 'bypassPermissions', '--allowedTools', allowedTools, prompt],
    { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  if (result.error) throw new Error(`Claude run failed: ${result.error.message}`);
  return (result.stdout || '').trim();
}

/**
 * Inspect the current working-tree diff (staged + unstaged + untracked) and decide
 * whether it is safe to turn into a PR. THROWS with a typed reason if not — callers
 * must catch and discard the branch.
 *
 * Returns { files: string[], lines: number } when allowed.
 */
export function assertDiffAllowed() {
  // Stage everything so new files are visible to --cached.
  git(['add', '-A']);
  const nameOnly = git(['diff', '--cached', '--name-only']).stdout;
  const files = nameOnly.split('\n').map((s) => s.trim()).filter(Boolean);

  if (files.length === 0) {
    const err = new Error('no-changes');
    err.guard = 'no-changes';
    throw err;
  }

  const offending = files.filter((f) => PROTECTED_PATH_REGEX.test(f));
  if (offending.length) {
    const err = new Error(`protected-path: ${offending.join(', ')}`);
    err.guard = 'protected-path';
    err.offending = offending;
    throw err;
  }

  if (files.length > MAX_DIFF_FILES) {
    const err = new Error(`too-many-files: ${files.length} > ${MAX_DIFF_FILES}`);
    err.guard = 'too-many-files';
    throw err;
  }

  const numstat = git(['diff', '--cached', '--numstat']).stdout;
  let lines = 0;
  for (const row of numstat.split('\n')) {
    const [add, del] = row.trim().split(/\s+/);
    lines += (Number(add) || 0) + (Number(del) || 0);
  }
  if (lines > MAX_DIFF_LINES) {
    const err = new Error(`too-large: ${lines} > ${MAX_DIFF_LINES} lines`);
    err.guard = 'too-large';
    throw err;
  }

  return { files, lines };
}

/**
 * Commit the staged diff on `branch`, push it, and open a PR via `gh`.
 * Uses GH_TOKEN from the environment — set it to GH_DISPATCH_TOKEN (a PAT) so the
 * resulting PR actually triggers CI (PRs opened with the default GITHUB_TOKEN do not).
 */
export function commitPushAndOpenPr({ branch, baseBranch = 'main', commitMessage, title, body, labels = [] }) {
  git(['commit', '-m', commitMessage]);
  git(['push', '--force-with-lease', '-u', 'origin', branch]);

  const args = ['pr', 'create', '--base', baseBranch, '--head', branch, '--title', title, '--body', body];
  for (const label of labels) args.push('--label', label);
  // Labels must already exist on the repo; --label fails otherwise, so create-if-missing is the caller's job.
  const res = sh('gh', args, { allowFail: true });
  if (res.status !== 0) {
    throw new Error(`gh pr create failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout; // PR URL
}

/** Ensure a label exists (idempotent) so `gh pr create --label` won't fail. */
export function ensureLabel(name, color = 'ededed', description = '') {
  sh('gh', ['label', 'create', name, '--color', color, '--description', description], { allowFail: true });
}

/** True if an OPEN or CLOSED PR already references `marker` in its body (sticky dedup). */
export function prExistsForMarker(marker) {
  const res = sh(
    'gh',
    ['pr', 'list', '--state', 'all', '--search', marker, '--json', 'number,state,body', '--limit', '50'],
    { allowFail: true },
  );
  if (res.status !== 0 || !res.stdout) return false;
  try {
    const prs = JSON.parse(res.stdout);
    return prs.some((pr) => typeof pr.body === 'string' && pr.body.includes(marker));
  } catch {
    return false;
  }
}

/** True if a remote branch already exists. */
export function remoteBranchExists(branch) {
  const res = git(['ls-remote', '--heads', 'origin', branch], { allowFail: true });
  return Boolean(res.stdout);
}
