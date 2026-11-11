/**
 * Which agent fixes may merge without Savannah, decided from the files a pull
 * request changes. Used by .github/workflows/auto-merge.yml.
 *
 * Savannah chose (2026-11-11) four kinds that may go live on their own once
 * every check passes and Strix has reviewed: library updates, bug fixes that
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
const DOCS = /^(docs\/.*|README\.md|[^/]+\.md|apps\/[^/]+\/README\.md|packages\/core\/copy\/.*)$/;
const CI = /^(\.github\/(workflows|scripts)\/|\.circleci\/)/;
const MANIFEST = /(^|\/)package\.json$|^pnpm-lock\.yaml$/;
// A CI fix may not touch token scope, secrets or the privileged trigger.
const CI_FORBIDDEN_LINE = /^[+-].*\b(permissions:|secrets\.|pull_request_target|GITHUB_TOKEN|id-token)/m;
const MAX_CHANGED_LINES = 400;

/** Same-major version bump for one package.json dependency line pair. */
function versionOf(line) {
  const m = line.match(/"[^"]+":\s*"[~^]?(\d+)\.(\d+)\.(\d+)[^"]*"/);
  return m ? Number(m[1]) : null;
}

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
 * @param {{ filename: string, status?: string, patch?: string, additions?: number, deletions?: number }[]} files
 * @returns {{ allowed: boolean, kinds: string[], reasons: string[] }}
 */
export function decide(files) {
  const reasons = [];
  const kinds = new Set();
  if (!files.length) return { allowed: false, kinds: [], reasons: ['the PR changes no files'] };

  const changed = files.reduce((n, f) => n + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  if (changed > MAX_CHANGED_LINES) reasons.push(`${changed} changed lines (over ${MAX_CHANGED_LINES}); a fix this big gets a human look`);

  for (const f of files) {
    for (const [pattern, why] of ALWAYS_HUMAN) {
      if (pattern.test(f.filename)) reasons.push(`${f.filename}: ${why}`);
    }
    if (TEST_FILE.test(f.filename) && f.status === 'removed') reasons.push(`${f.filename}: deletes a test`);
  }

  const manifests = files.filter((f) => MANIFEST.test(f.filename));
  const depsOnly = manifests.length === files.length;
  const hasTest = files.some((f) => TEST_FILE.test(f.filename) && f.status !== 'removed');

  for (const f of files) {
    const name = f.filename;
    if (MANIFEST.test(name)) {
      if (!depsOnly) reasons.push(`${name}: dependency changes must come on their own, not inside a fix`);
      else if (/package\.json$/.test(name) && !isMinorBumpPatch(f.patch)) reasons.push(`${name}: not a minor or patch version bump`);
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
      if (CI_FORBIDDEN_LINE.test(f.patch ?? '')) reasons.push(`${name}: touches token permissions or secrets`);
      kinds.add('check or deploy fix');
    } else {
      reasons.push(`${name}: not a kind of file that may merge on its own`);
    }
  }

  return { allowed: reasons.length === 0, kinds: [...kinds], reasons: [...new Set(reasons)] };
}
