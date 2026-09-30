import { reconcileBillingSnapshot } from './billingSnapshot.ts';
function assert(value: unknown, message: string) { if (!value) throw Error(message); }
Deno.test('equal-second competing commits refetch the latest Stripe snapshot', async () => {
  let revision = 1; let fetches = 0; let stored = 'active';
  await reconcileBillingSnapshot(
    () => Promise.resolve(revision),
    () => { fetches++; if (fetches === 1) { revision++; return Promise.resolve('stale'); } return Promise.resolve('canceled'); },
    (snapshot, expected) => { if (expected !== revision) return Promise.resolve({ retry: true }); stored = snapshot; return Promise.resolve({ retry: false }); },
  );
  assert(stored === 'canceled' && fetches === 2, 'stale snapshot cannot overwrite competing commit');
});
Deno.test('repeated conflicts throw so Stripe can retry without acknowledging the event', async () => {
  let count = 0; let rejected = false;
  try { await reconcileBillingSnapshot(() => Promise.resolve(null), () => Promise.resolve('active'), () => { count++; return Promise.resolve({ retry: true }); }); } catch { rejected = true; }
  assert(rejected && count === 3, 'bounded retry must remain a failure');
});
Deno.test('Stripe read failure never reaches database write', async () => {
  let writes = 0; let rejected = false;
  try { await reconcileBillingSnapshot(() => Promise.resolve(1), () => Promise.reject(Error('Stripe unavailable')), () => { writes++; return Promise.resolve({}); }); } catch { rejected = true; }
  assert(rejected && writes === 0, 'no stale fallback when Stripe cannot be read');
});
