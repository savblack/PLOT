// deno-lint-ignore-file require-await
// Async doubles preserve the Stripe client interface without network access.
import { CheckoutPendingError, subscriptionCheckout } from './checkout.ts';

function fixture(managed = true) {
  let attempt: Record<string, unknown> | null = null;
  let customer: string | null = null;
  let failPersist = false;
  let creates = 0;
  const sessions = new Map<string, { id: string; status: string; url: string; subscription?: string; managed_payments?: { enabled: boolean } }>();
  const subs: { status: string }[] = [];
  const admin = {
    rpc: () => {
      if (attempt?.lease_token) return { data: null };
      attempt ||= { operation_id: 'operation', managed_payments: managed, price_id: 'monthly', settings_url: 'https://example.invalid/settings', session_id: null, started_at: new Date().toISOString() };
      attempt.lease_token = crypto.randomUUID();
      return { data: { ...attempt } };
    },
    from: (table: string) => {
      let values: Record<string, unknown> | null = null;
      let token: unknown;
      const execute = () => {
        if (values && table === 'billing_checkout_attempts' && token === attempt?.lease_token) {
          if (values.session_id && failPersist) { failPersist = false; return { error: new Error('response lost') }; }
          Object.assign(attempt!, values);
        }
        return { data: table === 'billing_customers' ? customer ? { stripe_customer_id: customer } : null : [{ operation_id: attempt?.operation_id }] };
      };
      const query = {
        select: () => query, eq: (name: string, value: unknown) => { if (name === 'lease_token') token = value; return query; },
        update: (v: Record<string, unknown>) => { values = v; return query; },
        upsert: (v: { stripe_customer_id: string }) => { customer ||= v.stripe_customer_id; return query; },
        single: execute, maybeSingle: execute,
        then: (resolve: (v: unknown) => void) => resolve(execute()),
      };
      return query;
    },
  };
  const stripe = {
    customers: { create: async () => ({ id: 'cus_test' }) },
    subscriptions: { list: async function* () { yield* subs; }, retrieve: async () => ({ status: 'canceled' }) },
    checkout: { sessions: {
      create: async (params: { managed_payments?: { enabled: boolean } }, options: { idempotencyKey: string }) => {
        if (!sessions.has(options.idempotencyKey)) { creates++; sessions.set(options.idempotencyKey, { managed_payments: params.managed_payments, id: `cs_${creates}`, status: 'open', url: `https://checkout.example.invalid/${creates}` }); }
        return sessions.get(options.idempotencyKey)!;
      },
      retrieve: async (id: string) => [...sessions.values()].find(s => s.id === id)!,
      expire: async (id: string) => { [...sessions.values()].find(s => s.id === id)!.status = 'expired'; },
    } },
  };
  const call = (price = 'monthly') => subscriptionCheckout(admin as unknown as Parameters<typeof subscriptionCheckout>[0], stripe as unknown as Parameters<typeof subscriptionCheckout>[1], 'qa', price, 'https://example.invalid/settings', async () => 'portal');
  return { call, subs, sessions, creates: () => creates, loseResponse: () => { failPersist = true; }, age: () => { attempt!.started_at = new Date(Date.now() - 25 * 3600000).toISOString(); } };
}
function assert(value: unknown, message: string) { if (!value) throw Error(message); }
Deno.test('simultaneous first checkouts cannot create two sessions', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.call(), f.call()]);
  assert(results.filter(r => r.status === 'fulfilled').length === 1, 'one claim must win');
  assert(results.some(r => r.status === 'rejected' && r.reason instanceof CheckoutPendingError), 'losing claim has a safe retry message');
  assert(f.creates() === 1, 'one Stripe session');
  assert(await f.call() === 'https://checkout.example.invalid/1', 'retry returns same session');
});
Deno.test('lost session persistence replays the same idempotent creation', async () => {
  const f = fixture(); f.loseResponse(); await f.call().catch(() => {});
  assert(await f.call() === 'https://checkout.example.invalid/1' && f.creates() === 1, 'no duplicate after uncertain write');
});
Deno.test('plan change expires the old payment link before replacing it', async () => {
  const f = fixture(); await f.call(); await f.call('yearly');
  assert([...f.sessions.values()][0].status === 'expired' && f.creates() === 2, 'old checkout must be terminal');
});
Deno.test('unconfirmed creation beyond idempotency retention fails closed', async () => {
  const f = fixture(); f.loseResponse(); await f.call().catch(() => {}); f.age();
  const result = await Promise.allSettled([f.call()]);
  assert(result[0].status === 'rejected' && f.creates() === 1, 'cannot create a duplicate after retention');
});
Deno.test('incomplete and paused subscriptions cannot create another subscription', async () => {
  for (const status of ['active', 'past_due', 'incomplete', 'paused', 'unpaid']) {
    const f = fixture(); f.subs.push({ status });
    assert(await f.call() === 'portal' && f.creates() === 0, status);
  }
});
Deno.test('a terminal subscription permits a fresh checkout', async () => {
  const f = fixture(); await f.call(); const session = [...f.sessions.values()][0]; session.status = 'complete'; session.subscription = 'sub_canceled';
  f.subs.push({ status: 'canceled' }); await f.call();
  assert(f.creates() === 2, 'resubscribe after cancellation');
});

Deno.test('legacy uncertain attempts recover without returning an unmanaged payment link', async () => {
  const f = fixture(false); f.loseResponse(); await f.call().catch(() => {});
  const recovered = await Promise.allSettled([f.call()]);
  assert(recovered[0].status === 'rejected' && f.creates() === 1, 'recover legacy key without duplicate or URL');
  await f.call();
  const sessions = [...f.sessions.values()];
  assert(sessions[0].status === 'expired' && sessions[1].managed_payments?.enabled, 'expire legacy before managed replacement');
});

Deno.test('new sessions use Managed Payments', async () => {
  const f = fixture(); await f.call();
  assert([...f.sessions.values()][0].managed_payments?.enabled, 'managed checkout required');
});
