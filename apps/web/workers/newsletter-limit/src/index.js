import { DurableObject } from 'cloudflare:workers';
import { admit } from './policy.js';

const TABLE_SQL = 'CREATE TABLE IF NOT EXISTS admission (id INTEGER PRIMARY KEY, state TEXT NOT NULL, expires_at INTEGER NOT NULL)';

/** @extends {DurableObject<Env>} */
export class NewsletterLimit extends DurableObject {
  async check() {
    // Synchronous SQL keeps each read/decision/write atomic across concurrent calls.
    const decision = this.ctx.storage.transactionSync(() => {
      // deleteAll() also removes the table. Recreate it after an expiry alarm,
      // even if this object stays in memory and its constructor does not rerun.
      this.ctx.storage.sql.exec(TABLE_SQL);
      const row = this.ctx.storage.sql.exec('SELECT state FROM admission WHERE id = 1').toArray()[0];
      const next = admit(row && typeof row.state === 'string' ? JSON.parse(row.state) : null, Date.now());
      this.ctx.storage.sql.exec('INSERT INTO admission (id, state, expires_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state, expires_at = excluded.expires_at', JSON.stringify(next.state), next.expiresAt);
      return next;
    });
    await this.ctx.storage.setAlarm(decision.expiresAt);
    return { allowed: decision.allowed, retryAfter: decision.retryAfter };
  }

  async alarm() {
    this.ctx.storage.sql.exec(TABLE_SQL);
    const row = this.ctx.storage.sql.exec('SELECT expires_at FROM admission WHERE id = 1').toArray()[0];
    // A new request may have moved the expiry since this alarm was scheduled.
    if (row && typeof row.expires_at === 'number' && row.expires_at > Date.now()) {
      await this.ctx.storage.setAlarm(row.expires_at);
      return;
    }
    await this.ctx.storage.deleteAll();
  }
}

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/check') {
      return new Response(null, { status: 404 });
    }
    // This Worker has no route, workers.dev endpoint, or preview URL. Only the
    // website's service binding can supply this platform-derived client address.
    const ip = request.headers.get('x-plot-client-ip');
    if (!ip || ip.length > 45 || !/^[0-9a-f:.]+$/i.test(ip)) {
      return Response.json({ error: 'Client address unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      const result = await env.NEWSLETTER_LIMITS.getByName(key).check();
      return Response.json(result, {
        status: result.allowed ? 200 : 429,
        headers: { 'cache-control': 'no-store', ...(result.allowed ? {} : { 'retry-after': String(result.retryAfter) }) },
      });
    } catch {
      return Response.json({ error: 'Rate limit unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  },
};
