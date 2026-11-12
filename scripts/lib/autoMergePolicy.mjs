/**
 * Which agent fixes may merge without Savannah, decided from the files a pull
 * request changes. Used by .github/workflows/auto-merge.yml.
 *
 * Savannah chose (2026-11-11) four kinds that may go live on their own once
 * every check passes and GitHub's CodeQL security scan is clean: library updates, bug fixes that
 * come with a test, fixes to broken checks and deploys, and wording/docs.
 * Payments, the database, permissions and member data always wait for her.
 *
 * The rule is "allowed only if every file fits an allowed kind". Anything not
 * recognised waits for her, so a new kind of file is never auto-merged by
 * accident. The policy refuses changes to itself and to the workflow that
 * applies it, so an agent fix cannot widen its own permissions.
 */

/** Paths that always wait for Savannah, whatever else the PR contains. */
const ALWAYS_HUMAN = [
  [/^supabase\/migrations\//, 'database migration'],
  [/^supabase\/config\.toml$/, 'Supabase function config (verify_jwt)'],
  [/(billing|premium|checkout|stripe|kofi|payment|subscription)/i, 'payments or Premium'],
  [/(auth|grant|rls|polic(y|ies)|permission|delete-account|signup|profile)/i, 'sign-in, permissions or member data'],
  [/^apps\/website\/(privacy|terms|community|legal|cookie)[^/]*$/i, 'legal page'],
  [/^marketing\//, 'marketing content'],
  [/(^|\/)\.env/, 'environment file'],
  [/(^|\/)AGENT_HANDOFF\.md$/, 'handoff note still in the PR'],
  [/^functions\/_middleware\.js$/, 'security headers'],
  [/(^|\/)_headers$/, 'security headers'],
  [/^scripts\/check-[^/]+$/, 'a CI guard script'],
  [/^scripts\/staging-[^/]+-test\.sql$/, 'a Staging security test'],
  [/^scripts\/lib\/autoMergePolicy\.mjs$/, 'the auto-merge rules themselves'],
  [/^\.github\/workflows\/auto-merge\.yml$/, 'the auto-merge workflow itself'],
  [/^\.github\/workflows\/self-fix-digest\.yml$/, 'the auto-merge report'],
  [/^\.github\/CODEOWNERS$/, 'code ownership'],
  // Instructions and config the agents themselves read.
  [/(^|\/)(AGENTS|CLAUDE|GROK-HANDOFF)\.md$/i, 'agent instructions'],
  [/^\.(claude|agents|cursor)\//, 'agent configuration'],
  [/^skills-lock\.json$/, 'agent configuration'],
  // Shell that runs with repo secrets, and the CI workflow both merge flows
  // trust: even a "safe" line there (continue-on-error) could make it pass
  // without checking anything.
  [/^\.github\/scripts\//, 'a script workflows run with secrets'],
  [/^\.github\/workflows\/ci\.yml$/, 'the CI pipeline that gates merges'],
  [/^\.github\/workflows\/dependabot-automerge\.yml$/, 'the Dependabot auto-merge workflow'],
  // Decides which CI steps run; a docs-only verdict skips them all and passes.
  [/^scripts\/(ci-tier\.mjs|agent\/ciTier\.mjs)$/, 'the rules for how much CI runs'],
  // Security-relevant code whose names the keyword rules above do not catch.
  [/(security|serviceKey|serviceBearer|supabaseAdmin|actingUser|internalWebhook|webhook|export-user|csp|_middleware|_lib\/)/i, 'security, service access or member data export'],
];

const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE = [
  /^apps\/web\/src\//,
  /^apps\/mobile\/(app|lib|components|hooks)\//,
  /^packages\/core\//,
  /^supabase\/functions\//,
  /^apps\/web\/workers\/[^/]+\/src\//,
  /^functions\//,
  /^apps\/website\/(js|functions)\//,
];
// Markdown only. packages/core/copy/*.js is code, so it is a source change and needs a test.
const DOCS = /^(docs\/.*\.md|README\.md|apps\/[^/]+\/README\.md)$/;
const CI = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const MANIFEST = /(^|\/)package\.json$|^pnpm-lock\.yaml$/;
// A workflow fix may only change these kinds of line. Anything else (a new
// step, a new `run:`, a secret, a trigger, token scope) waits for Savannah:
// a deny-list cannot see an exfiltrating curl spelled some new way.
const CI_SAFE_LINE = /^\s*(-\s*)?(runs-on|timeout-minutes|node-version|deno-version|python-version|cache|fetch-depth|continue-on-error):\s*[\w.'"/@-]+\s*(#.*)?$|^\s*(-\s*)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s*(#.*)?$|^\s*-\s*cron:\s*'[0-9*\/, -]+'\s*(#.*)?$|^\s*(#.*)?$/;

/** Every changed line of a workflow patch is on the safe list. */
export function isSafeWorkflowPatch(patch) {
  if (!patch) return false;
  const changed = patch.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  return changed.length > 0 && changed.every((l) => CI_SAFE_LINE.test(l.slice(1)));
}
const MAX_CHANGED_LINES = 400;

/** Same-major version bump for one package.json dependency line pair. */
function versionOf(line) {
  // A plain range only: no `||`, `file:`, `git+`, tags or URLs after the version.
  const m = line.match(/"[^"]+":\s*"[~^]?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.]+)?"\s*,?\s*$/);
  return m ? Number(m[1]) : null;
}

// Lockfile lines that point a package somewhere other than the registry.
const LOCK_UNUSUAL = /^\+.*\b(tarball:|file:|link:|git\+|github:|https?:\/\/(?!registry\.npmjs\.org))/m;

/**
 * A package.json patch that only moves versions within the same major.
 * Adding or removing a dependency, or any non-version line, fails.
 */
export function isMinorBumpPatch(patch = '') {
  const removed = [];
  const added = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1));
    else if (line.startsWith('+')) added.push(line.slice(1));
  }
  if (removed.length === 0 || removed.length !== added.length) return false;
  const name = (l) => (l.match(/"([^"]+)":/) || [])[1];
  for (let i = 0; i < removed.length; i++) {
    if (name(removed[i]) !== name(added[i])) return false;
    const before = versionOf(removed[i]);
    const after = versionOf(added[i]);
    if (before === null || after === null || before !== after) return false;
  }
  return true;
}

/**
 * @param {{ filename: string, previous_filename?: string, status?: string, patch?: string, additions?: number, deletions?: number }[]} files
 * @param {number} [expectedCount] the PR's changed_files; a shorter list means the API truncated it
 * @returns {{ allowed: boolean, kinds: string[], reasons: string[] }}
 */
export function decide(files, expectedCount) {
  const reasons = [];
  const kinds = new Set();
  if (!files.length) return { allowed: false, kinds: [], reasons: ['the PR changes no files'] };
  if (expectedCount !== undefined && files.length !== expectedCount) {
    return { allowed: false, kinds: [], reasons: [`read ${files.length} of ${expectedCount} changed files`] };
  }

  const changed = files.reduce((n, f) => n + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  if (changed > MAX_CHANGED_LINES) reasons.push(`${changed} changed lines (over ${MAX_CHANGED_LINES}); a fix this big gets a human look`);

  for (const f of files) {
    // A rename is judged on both names, so a protected file cannot leave under an innocent one.
    for (const path of [f.filename, f.previous_filename].filter(Boolean)) {
      for (const [pattern, why] of ALWAYS_HUMAN) {
        if (pattern.test(path)) reasons.push(`${path}: ${why}`);
      }
    }
    if (f.status === 'renamed' && !DOCS.test(f.filename)) reasons.push(`${f.filename}: renames a file`);
    if (f.status === 'removed' && !DOCS.test(f.filename)) reasons.push(`${f.filename}: deletes a file`);
  }

  const manifests = files.filter((f) => MANIFEST.test(f.filename));
  const depsOnly = manifests.length === files.length && manifests.some((f) => /package\.json$/.test(f.filename));
  const hasTest = files.some((f) => TEST_FILE.test(f.filename) && f.status !== 'removed');

  for (const f of files) {
    const name = f.filename;
    if (MANIFEST.test(name)) {
      if (!depsOnly) reasons.push(`${name}: dependency changes must come on their own, not inside a fix`);
      else if (/package\.json$/.test(name) && !isMinorBumpPatch(f.patch)) reasons.push(`${name}: not a minor or patch version bump`);
      else if (name === 'pnpm-lock.yaml' && (!f.patch || LOCK_UNUSUAL.test(f.patch))) reasons.push(`${name}: lockfile points a package outside the npm registry, or is too large to read`);
      else kinds.add('library update');
    } else if (TEST_FILE.test(name)) {
      kinds.add('bug fix with a test');
    } else if (DOCS.test(name)) {
      // Before SOURCE: packages/core/copy/ is wording, not logic.
      kinds.add('wording or docs');
    } else if (SOURCE.some((p) => p.test(name))) {
      if (!hasTest) reasons.push(`${name}: code change without a test`);
      kinds.add('bug fix with a test');
    } else if (CI.test(name)) {
      if (f.status !== 'modified') reasons.push(`${name}: adds or removes a workflow`);
      else if (!isSafeWorkflowPatch(f.patch)) reasons.push(`${name}: changes more than versions, runners, timeouts or schedules`);
      kinds.add('check or deploy fix');
    } else {
      reasons.push(`${name}: not a kind of file that may merge on its own`);
    }
  }

  return { allowed: reasons.length === 0, kinds: [...kinds], reasons: [...new Set(reasons)] };
}
