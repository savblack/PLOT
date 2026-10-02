// Pure logic for scripts/check-migration-drift.mjs. No I/O here, so the rules
// that decide what counts as drift are unit-tested in
// apps/web/tests/unit/migrationDriftChecks.test.js against the shapes that
// actually happened in September 2026.

const MIGRATION_FILE = /^(\d{14})_(.+)\.sql$/;

/**
 * Map migration filenames to { version → name }. Anything that is not a
 * `<14 digits>_<name>.sql` file is ignored, as the Supabase CLI ignores it.
 *
 * @param {string[]} filenames
 * @returns {Map<string, string>}
 */
export function parseMigrationFiles(filenames) {
  const out = new Map();
  for (const file of filenames) {
    const m = MIGRATION_FILE.exec(file);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * Compare one database's supabase_migrations.schema_migrations against the
 * migration files in this checkout.
 *
 * `branchNew` is the set of versions this branch adds on top of origin/main.
 * Those are expected to be unrecorded on production until the branch merges,
 * so they are reported but not failed.
 *
 * @param {{ files: Map<string, string>, ledger: Map<string, string>, branchNew?: Set<string> }} input
 * @returns {{ missing: string[], pending: string[], extra: string[], mismatched: { version: string, file: string, recorded: string }[] }}
 */
export function compareLedger({ files, ledger, branchNew = new Set() }) {
  const missing = [];
  const pending = [];
  const mismatched = [];
  for (const [version, name] of files) {
    if (!ledger.has(version)) {
      (branchNew.has(version) ? pending : missing).push(version);
      continue;
    }
    const recorded = ledger.get(version) ?? '';
    // A null name is how a row recorded by hand usually looks. It says nothing
    // about which migration took the version, so it is not a mismatch.
    if (recorded && recorded !== name) mismatched.push({ version, file: name, recorded });
  }
  const extra = [...ledger.keys()].filter((v) => !files.has(v));
  const byVersion = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    missing: missing.sort(byVersion),
    pending: pending.sort(byVersion),
    extra: extra.sort(byVersion),
    mismatched: mismatched.sort((a, b) => byVersion(a.version, b.version)),
  };
}

/**
 * Diff two schema fingerprints (key → hash of the object's definition).
 *
 * @param {Map<string, string>} staging
 * @param {Map<string, string>} production
 * @returns {{ onlyProduction: string[], onlyStaging: string[], differ: string[] }}
 */
export function diffFingerprints(staging, production) {
  const onlyProduction = [];
  const differ = [];
  for (const [key, hash] of production) {
    if (!staging.has(key)) onlyProduction.push(key);
    else if (staging.get(key) !== hash) differ.push(key);
  }
  const onlyStaging = [...staging.keys()].filter((k) => !production.has(k));
  return { onlyProduction: onlyProduction.sort(), onlyStaging: onlyStaging.sort(), differ: differ.sort() };
}

/**
 * Turn the three comparisons into failures and warnings. Kept separate from
 * the comparisons so the severity rules are in one readable place:
 *
 * Production is the source of truth for what `main` has shipped, so anything
 * off there fails: a main migration it never recorded (the automatic apply
 * failed or skipped it), a row with no file on main (applied from a branch),
 * or a version recorded under another migration's name (a collision, which
 * makes the automatic apply skip the file on main as "already applied").
 *
 * Staging is also where branches are tried out, so rows with no file on main
 * are expected there and only warned about. A main migration Staging has not
 * recorded, or a version Staging recorded under another name, still fails:
 * the first means Staging is behind, the second is exactly the collision that
 * hid refresh_premium_badges from Staging on 2026-09-26.
 *
 * Schema: an object production has and Staging lacks fails, because that is
 * the drift the ledger cannot see (a migration recorded but never run). A
 * definition that differs is expected while Staging carries branch-only
 * migrations, which redefine functions, so it fails only when Staging has none.
 *
 * Table-wide grants (`grant:` keys) only ever warn. They come from each
 * project's default privileges, set when the project was created rather than
 * by any migration: production gives anon and authenticated everything and
 * leaves the guarding to RLS, Staging was created tighter. Failing on that
 * nightly would teach everyone to ignore the check. Column grants and function
 * EXECUTE are set by migrations, so those still count.
 *
 * @param {{
 *   production?: ReturnType<typeof compareLedger>,
 *   staging?: ReturnType<typeof compareLedger>,
 *   schema?: ReturnType<typeof diffFingerprints>,
 * }} results
 * @returns {{ failures: string[], warnings: string[], notes: string[] }}
 */
export function classifyDrift({ production, staging, schema }) {
  const failures = [];
  const warnings = [];
  const notes = [];
  const list = (vs) => vs.join(', ');

  if (production) {
    if (production.missing.length) failures.push(`production has not recorded ${production.missing.length} migration(s) on main: ${list(production.missing)}. The automatic apply on merge failed or skipped them.`);
    if (production.extra.length) failures.push(`production recorded ${production.extra.length} migration(s) with no file on main: ${list(production.extra)}. They were applied from a branch.`);
    for (const m of production.mismatched) failures.push(`production recorded ${m.version} as "${m.recorded}", but main's file is "${m.file}". main's migration was skipped as already applied.`);
    if (production.pending.length) notes.push(`${production.pending.length} migration(s) new on this branch, not yet on production (expected): ${list(production.pending)}`);
  }

  if (staging) {
    if (staging.missing.length) failures.push(`Staging has not recorded ${staging.missing.length} migration(s) from this checkout: ${list(staging.missing)}. If the schema check finds nothing missing, they were applied by hand and only need recording.`);
    for (const m of staging.mismatched) failures.push(`Staging recorded ${m.version} as "${m.recorded}", but this checkout's file is "${m.file}". Two migrations share a version: renumber the one that has not merged.`);
    if (staging.extra.length) warnings.push(`Staging has ${staging.extra.length} branch-only migration(s) with no file here: ${list(staging.extra)}`);
    if (staging.pending.length) notes.push(`${staging.pending.length} migration(s) new on this branch, not yet on Staging: ${list(staging.pending)}`);
  }

  if (schema) {
    const isGrant = (k) => k.startsWith('grant:');
    const missing = schema.onlyProduction.filter((k) => !isGrant(k));
    const differ = schema.differ.filter((k) => !isGrant(k));
    const grants = [...schema.onlyProduction, ...schema.differ].filter(isGrant).sort();
    if (missing.length) failures.push(`Staging is missing ${missing.length} object(s) production has: ${list(missing)}`);
    if (differ.length) {
      const msg = `${differ.length} object(s) defined differently on Staging and production: ${list(differ)}`;
      if (staging?.extra.length) warnings.push(`${msg} (expected while Staging carries branch-only migrations)`);
      else failures.push(msg);
    }
    if (grants.length) warnings.push(`${grants.length} table grant(s) differ (project default privileges, not migrations): ${list(grants)}`);
    if (schema.onlyStaging.length) warnings.push(`${schema.onlyStaging.length} object(s) exist only on Staging: ${list(schema.onlyStaging)}`);
  }

  return { failures, warnings, notes };
}
