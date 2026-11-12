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
  // Shell that runs with repo secrets, and CircleCI, which runs arbitrary code.
  [/^\.github\/scripts\//, 'a script workflows run with secrets'],
  [/^\.circleci\//, 'the CircleCI pipeline'],
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
// Not on the list, because each can switch a safety check off without a red X:
// `continue-on-error` (a failing step passes), `cron:` (a schedule that never
// fires, like 31 February), and any runner but the exact labels below (an
// unknown label leaves the job queued forever).
// Values are a bare word or one balanced pair of quotes around it, and never
// contain `..`; timeout-minutes and fetch-depth are numbers.
const CI_SAFE_LINE = /^\s*(-\s*)?(timeout-minutes|fetch-depth):\s*\d+\s*(#.*)?$|^\s*(-\s*)?(node-version|deno-version|python-version|cache):\s*(?:([\w.@/-]+)|'([\w.@/-]+)'|"([\w.@/-]+)")\s*(#.*)?$|^\s*(-\s*)?runs-on:\s*(?:([\w.-]+)|'([\w.-]+)'|"([\w.-]+)")\s*(#.*)?$|^\s*(-\s*)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s*(#.*)?$|^\s*(#.*)?$/;
const NO_DOTDOT = (line) => !line.replace(/#.*$/, '').includes('..');
// The action a `uses:` line runs (owner/repo, plus any sub-path), without its pin.
const USES = /^(\s*(?:-\s*)?)uses:\s*([\w.-]+\/[\w./-]+)@/;
// A key line's identity: its indentation, list dash and key name.
const KEY = /^(\s*(?:-\s*)?[\w-]+):/;
// Only these GitHub-hosted runner labels. A self-hosted runner is a machine
// outside GitHub, and a label GitHub doesn't have leaves the job queued.
const RUNNERS = new Set([
  'ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04', 'ubuntu-24.04-arm', 'ubuntu-22.04-arm',
  'macos-latest', 'macos-15', 'macos-14',
  'windows-latest', 'windows-2025', 'windows-2022',
]);
const RUNS_ON = /^\s*(?:-\s*)?runs-on:\s*(?:([\w.-]+)|'([\w.-]+)'|"([\w.-]+)")\s*(#.*)?$/;
const knownRunner = (line) => {
  const m = line.match(RUNS_ON);
  return Boolean(m) && RUNNERS.has(m[1] || m[2] || m[3]);
};
// Printable ASCII and tab only. YAML treats some other characters (U+0085, for
// one) as a line break that git and this parser do not, so a "comment" could
// carry a second line, such as a new `run:` step.
const PLAIN = /^[\t\x20-\x7e]*$/;

/** What a changed line stands for, so a replacement can be matched to it. */
function identity(line) {
  const uses = line.match(USES);
  if (uses) return `${uses[1]}uses:${uses[2]}`;
  const key = line.match(KEY);
  return key ? key[1] : null; // null: a comment or blank line
}

/**
 * Split a unified diff into change blocks: removed lines directly followed by
 * the lines that replaced them, with no context or hunk header between.
 */
function changeBlocks(patch) {
  const blocks = [];
  let cur = null;
  for (const raw of patch.split('\n')) {
    const line = raw.replace(/\r$/, '');
    // File headers only; a removed `---` YAML document marker is content.
    if (/^(\+\+\+|---) (a\/|b\/|\/dev\/null)/.test(line)) { cur = null; continue; }
    const sign = line[0];
    if (sign === '-' || sign === '+') {
      if (!cur || (sign === '-' && cur.added.length)) blocks.push((cur = { removed: [], added: [] }));
      (sign === '-' ? cur.removed : cur.added).push(line.slice(1));
    } else {
      cur = null; // context, `@@`, `\ No newline at end of file`
    }
  }
  return blocks;
}

/**
 * A workflow patch that only changes values in place: every changed line is
 * on the safe list, and every changed setting replaces the same setting at the
 * same place. So a pin bump passes, and a new, swapped, moved or dropped step
 * waits. A pinned `uses:` line runs someone's code with the workflow's
 * secrets, which is why a fix may only re-pin an action the workflow already
 * runs, where it already runs it.
 */
export function isSafeWorkflowPatch(patch) {
  if (!patch) return false;
  const blocks = changeBlocks(patch);
  if (blocks.length === 0) return false;
  for (const { removed, added } of blocks) {
    const lines = [...removed, ...added];
    if (!lines.every((l) => PLAIN.test(l) && CI_SAFE_LINE.test(l) && NO_DOTDOT(l))) return false;
    if (!added.every((l) => !/^\s*(?:-\s*)?runs-on:/.test(l) || knownRunner(l))) return false;
    // Comments and blank lines may come and go; settings must be replaced in
    // place, one for one, by the same setting at the same indentation.
    const before = removed.map(identity).filter(Boolean);
    const after = added.map(identity).filter(Boolean);
    if (before.length !== after.length || !before.every((id, i) => id === after[i])) return false;
  }
  return true;
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
