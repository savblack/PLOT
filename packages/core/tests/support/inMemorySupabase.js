/* An in-memory stand-in for the Supabase client — the second adapter at the
 * seam `config.supabaseClient` opens. The first is the real createClient one.
 *
 * It implements only the slice of the PostgREST builder core actually uses:
 * from().select().eq().maybeSingle() / .single() / .order() / .range(), plus
 * insert / update / delete / upsert. That is deliberate — it is a test double,
 * not a Postgres. If core starts using a builder method this doesn't have, the
 * call returns an explicit error rather than silently resolving undefined, so
 * the gap shows up as a failing test instead of a passing one.
 *
 * Constraints are declared per table so the failures worth testing — unique
 * violations surfacing as 23505 — can actually be provoked. `getOrCreateMyListId`
 * recovers from exactly that race, and there was previously no way to exercise it.
 */

/** A thenable query builder: every method returns `this`, awaiting runs it. */
class Query {
  constructor(db, table, op, payload) {
    this.db = db;
    this.table = table;
    this.op = op;
    this.payload = payload;
    this.filters = [];
    this.mode = 'many';       // 'many' | 'single' | 'maybeSingle'
    this.orderBy = null;
    this.rangeArgs = null;
    this.selected = null;
  }

  select(cols) { this.selected = cols ?? '*'; return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  in(col, vals) { this.filters.push([col, vals, 'in']); return this; }
  order(col, opts) { this.orderBy = [col, opts?.ascending !== false]; return this; }
  range(from, to) { this.rangeArgs = [from, to]; return this; }
  limit(n) { this.rangeArgs = [0, n - 1]; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybeSingle'; return this; }

  matches(row) {
    return this.filters.every(([col, val, kind]) =>
      kind === 'in' ? val.includes(row[col]) : row[col] === val);
  }

  rows() {
    return this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
  }

  run() {
    this.db.runBefore(this.table, this.op);

    const forced = this.db.takeFailure(this.table, this.op);
    if (forced) return { data: null, error: forced };

    switch (this.op) {
      case 'select': return this.runSelect();
      case 'insert': return this.runInsert();
      case 'update': return this.runUpdate();
      case 'delete': return this.runDelete();
      case 'upsert': return this.runUpsert();
      default:
        return { data: null, error: { message: `inMemorySupabase: unsupported op "${this.op}"` } };
    }
  }

  shape(matched) {
    if (this.mode === 'single') {
      if (matched.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: 'expected exactly one row' } };
      }
      return { data: matched[0], error: null };
    }
    if (this.mode === 'maybeSingle') {
      if (matched.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'expected at most one row' } };
      }
      return { data: matched[0] ?? null, error: null };
    }
    return { data: matched, error: null };
  }

  runSelect() {
    let matched = this.rows().filter(r => this.matches(r));
    if (this.orderBy) {
      const [col, asc] = this.orderBy;
      matched = [...matched].sort((a, b) =>
        (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (this.rangeArgs) matched = matched.slice(this.rangeArgs[0], this.rangeArgs[1] + 1);
    return this.shape(matched);
  }

  runInsert() {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
    const violation = this.db.findUniqueViolation(this.table, incoming);
    if (violation) {
      return {
        data: null,
        error: {
          code: '23505',
          message: `duplicate key value violates unique constraint "${violation}"`,
        },
      };
    }
    const created = incoming.map(row => ({ id: this.db.nextId(), ...row }));
    this.rows().push(...created);
    return this.shape(created);
  }

  runUpsert() {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
    const written = incoming.map((row) => {
      const existing = this.db.findByUnique(this.table, row);
      if (existing) { Object.assign(existing, row); return existing; }
      const created = { id: this.db.nextId(), ...row };
      this.rows().push(created);
      return created;
    });
    return this.shape(written);
  }

  runUpdate() {
    const matched = this.rows().filter(r => this.matches(r));
    matched.forEach(r => Object.assign(r, this.payload));
    return this.shape(matched);
  }

  runDelete() {
    const matched = this.rows().filter(r => this.matches(r));
    this.db.tables[this.table] = this.rows().filter(r => !this.matches(r));
    return this.shape(matched);
  }

  then(resolve, reject) {
    try { return Promise.resolve(this.run()).then(resolve, reject); }
    catch (e) { return Promise.reject(e).catch(reject); }
  }
}

export function createInMemorySupabase({ tables = {}, unique = {}, session = null } = {}) {
  let seq = 0;
  const failures = [];
  const hooks = [];

  const db = {
    tables: structuredClone(tables),
    nextId: () => `id-${++seq}`,

    /** Declared unique keys, e.g. { lists: ['user_id', 'name'] }. */
    findByUnique(table, row) {
      const cols = unique[table];
      if (!cols) return null;
      return (db.tables[table] ?? []).find(r => cols.every(c => r[c] === row[c])) ?? null;
    },

    findUniqueViolation(table, incoming) {
      const cols = unique[table];
      if (!cols) return null;
      return incoming.some(row => db.findByUnique(table, row)) ? `${table}_${cols.join('_')}_key` : null;
    },

    /** Queue a one-shot error for the next matching call. */
    failNext(table, op, error) { failures.push({ table, op, error }); },

    takeFailure(table, op) {
      const i = failures.findIndex(f => f.table === table && (!f.op || f.op === op));
      return i === -1 ? null : failures.splice(i, 1)[0].error;
    },

    /* Run a one-shot side effect immediately before the next matching call.
       This is how a concurrent writer is modelled: "between your read and your
       insert, another flow committed." Nothing else can express that ordering,
       and it is the ordering the 23505 recovery paths exist for. */
    beforeNext(table, op, fn) { hooks.push({ table, op, fn }); },

    runBefore(table, op) {
      const i = hooks.findIndex(h => h.table === table && (!h.op || h.op === op));
      if (i !== -1) hooks.splice(i, 1)[0].fn(db);
    },
  };

  return {
    __db: db,
    failNext: db.failNext,
    beforeNext: db.beforeNext,
    from(table) {
      return {
        select: (cols) => new Query(db, table, 'select').select(cols),
        insert: (payload) => new Query(db, table, 'insert', payload),
        update: (payload) => new Query(db, table, 'update', payload),
        upsert: (payload) => new Query(db, table, 'upsert', payload),
        delete: () => new Query(db, table, 'delete'),
      };
    },
    auth: {
      async getSession() { return { data: { session } }; },
      async signOut() { return { error: null }; },
    },
    async rpc(name) {
      return { data: null, error: { message: `inMemorySupabase: no stub for rpc("${name}")` } };
    },
  };
}
