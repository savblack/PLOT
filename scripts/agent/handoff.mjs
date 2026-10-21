/**
 * The committed handoff note. It travels with the branch.
 * It must not contain a credential.
 */

const SECRET_PATTERNS = [
  { name: 'stripe live key', re: /sk_live_[A-Za-z0-9]+/ },
  { name: 'stripe test key', re: /sk_test_[A-Za-z0-9]+/ },
  { name: 'supabase secret key', re: /sb_secret_[A-Za-z0-9_-]+/ },
  { name: 'aws access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github personal access token', re: /github_pat_[A-Za-z0-9_]+/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'assigned secret', re: /\b(TMDB_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|RESEND_API_KEY|BUFFER_API_KEY|STRIPE_SECRET_KEY|BACKUP_GPG_PASSPHRASE|CLAUDE_CODE_OAUTH_TOKEN|CHROMATIC_PROJECT_TOKEN)\s*=\s*\S+/ },
  { name: 'bearer token', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
];

/** @param {string} text */
export function secretFindings(text) {
  const source = String(text || '');
  return SECRET_PATTERNS.filter((pattern) => pattern.re.test(source)).map((pattern) => pattern.name);
}

/**
 * @param {{ title: string, status: string, branch: string, updated: string, next: string }} note
 */
export function renderHandoff(note) {
  const body = [
    `# ${note.title}`,
    '',
    `Status: ${note.status}`,
    `Branch: ${note.branch}`,
    `Updated: ${note.updated}`,
    '',
    '## Next',
    '',
    note.next.trim(),
    '',
  ].join('\n');
  const findings = secretFindings(body);
  if (findings.length) {
    const error = new Error(`Handoff note contains a secret (${findings.join(', ')}). Rewrite "next" without it.`);
    error.code = 'HANDOFF_SECRET';
    throw error;
  }
  return body;
}

export const HANDOFF_FILE = 'AGENT_HANDOFF.md';
export const SESSION_FILE = '.plot-session.json';
export const STALE_LOCK_MS = 12 * 60 * 60 * 1000;

/**
 * An active lock is stale when it is older than 12 hours and the worktree
 * has not moved since the lock was written. A dirty tree is not stale.
 *
 * @param {{ status?: string, updated?: string, dirty?: boolean, headCommitMs?: number }} lock
 * @param {number} nowMs
 */
export function lockIsStale(lock, nowMs) {
  if (!lock || lock.status !== 'active' || lock.dirty) return false;
  const updated = Date.parse(lock.updated || '');
  if (Number.isNaN(updated)) return false;
  if (nowMs - updated < STALE_LOCK_MS) return false;
  if (lock.headCommitMs && lock.headCommitMs > updated) return false;
  return true;
}
