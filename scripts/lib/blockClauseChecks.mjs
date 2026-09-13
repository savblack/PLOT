// Pure extraction + rule logic for `npm run db:block-clause`. The CLI wrapper
// in scripts/check-block-clause.mjs reads the migrations and formats the
// output; the decisions live here so apps/web/tests/unit/blockClauseChecks.test.js
// can prove the guard flags a stale redefinition rather than merely existing.
//
// See scripts/check-block-clause.mjs for why this check exists.

const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Every `create [or replace] function` and `drop function` in one migration,
 * in file order, with the dollar-quoted body attached to each definition.
 *
 * Bodies are matched by their opening dollar-quote tag (`$$`, `$function$`, …)
 * and read to the next occurrence of that same tag, which is how Postgres
 * itself delimits them — so a `$$` inside a `$function$` body cannot end it.
 *
 * @param {string} sql contents of one migration file
 * @returns {{ kind: 'define'|'drop', name: string, body: string }[]}
 */
export function extractFunctionStatements(sql) {
  const out = [];
  const re = /\b(create\s+(?:or\s+replace\s+)?function|drop\s+function(?:\s+if\s+exists)?)\s+(?:public\.)?("?)([A-Za-z_][A-Za-z0-9_]*)\2/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[3];
    if (/^drop/i.test(m[1])) {
      out.push({ kind: 'drop', name, body: '' });
      continue;
    }
    const rest = sql.slice(re.lastIndex);
    const open = rest.match(DOLLAR_TAG);
    if (!open) { out.push({ kind: 'define', name, body: '' }); continue; }
    const tag = open[0];
    const afterOpen = rest.slice(open.index + tag.length);
    const close = afterOpen.indexOf(tag);
    out.push({ kind: 'define', name, body: close === -1 ? afterOpen : afterOpen.slice(0, close) });
  }
  return out;
}

/**
 * The body each function has AFTER every migration has been applied — i.e. what
 * production actually runs. Later files win; a `drop function` removes it.
 *
 * @param {{ file: string, sql: string }[]} migrations sorted oldest first
 * @returns {Map<string, { file: string, body: string }>}
 */
export function latestDefinitions(migrations) {
  const latest = new Map();
  for (const { file, sql } of migrations) {
    for (const stmt of extractFunctionStatements(sql)) {
      if (stmt.kind === 'drop') latest.delete(stmt.name);
      else latest.set(stmt.name, { file, body: stmt.body });
    }
  }
  return latest;
}

/** True when a function body reads the profiles table — i.e. serves identity. */
export function readsProfiles(body) {
  return /\b(?:from|join)\s+(?:public\.)?profiles\b/i.test(body);
}

/** True when a function body carries the symmetric block filter. */
export function hasBlockClause(body) {
  return /\bnot_blocked\s*\(/i.test(body);
}

/**
 * @param {object} input
 * @param {Map<string, { file: string, body: string }>} input.latest
 * @param {string[]} input.filtered  functions that MUST carry the clause
 * @param {string[]} input.exempt    functions that must NOT carry it
 * @returns {{ ok: boolean, failures: { code: string, names: string[] }[] }}
 */
export function checkBlockClause({ latest, filtered, exempt }) {
  const filteredSet = new Set(filtered);
  const exemptSet = new Set(exempt);
  const failures = [];
  const add = (code, names) => { if (names.length) failures.push({ code, names: names.sort() }); };

  const identity = [...latest.entries()]
    .filter(([, { body }]) => readsProfiles(body))
    .map(([name]) => name);

  add('unclassified', identity.filter(n => !filteredSet.has(n) && !exemptSet.has(n)));
  add('unknown', [...new Set([...filtered, ...exempt])].filter(n => !latest.has(n)));
  add('overlap', filtered.filter(n => exemptSet.has(n)));
  add('missing-clause', filtered.filter(n => latest.has(n) && !hasBlockClause(latest.get(n).body)));
  add('unexpected-clause', exempt.filter(n => latest.has(n) && hasBlockClause(latest.get(n).body)));

  return { ok: failures.length === 0, failures };
}
