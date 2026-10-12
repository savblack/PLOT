/** Check Expo receipts after delivery; disable unregistered devices. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);
  const db = createClient<Database>(Deno.env.get('SUPABASE_URL')!, serviceKey());
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const expired = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  try {
    const { data, error } = await db.from('push_deliveries')
      .select('notification_id,token,provider_ref,sent_at')
      .eq('status', 'sent').is('receipted_at', null).not('provider_ref', 'is', null)
      .lte('sent_at', cutoff).gte('sent_at', expired)
      .order('sent_at').limit(100);
    if (error) throw new Error(`deliveries read failed: ${error.message}`);
    const rows = (data ?? []).filter(r => r.provider_ref);
    if (!rows.length) return json({ ok: true, checked: 0 });
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: rows.map(r => r.provider_ref) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Expo returned ${response.status}`);
    const body = await response.json();
    const receipts = body?.data ?? {};
    let checked = 0, disabled = 0;
    for (const row of rows) {
      const receipt = receipts[row.provider_ref!];
      if (!receipt) continue;
      const invalid = receipt.details?.error === 'DeviceNotRegistered';
      const now = new Date().toISOString();
      const { error: writeError } = await db.from('push_deliveries').update({
        receipted_at: now,
        status: invalid ? 'disabled' : receipt.status === 'ok' ? 'sent' : 'failed',
        error: receipt.status === 'error' ? String(receipt.details?.error ?? receipt.message ?? 'receipt failed').slice(0, 120) : null,
      }).eq('notification_id', row.notification_id).eq('token', row.token);
      if (writeError) throw new Error(`receipt status failed: ${writeError.message}`);
      if (invalid) {
        const { error: tokenError } = await db.from('push_tokens').update({ disabled_at: now }).eq('token', row.token);
        if (tokenError) throw new Error(`token disable failed: ${tokenError.message}`);
        disabled++;
      }
      checked++;
    }
    return json({ ok: true, checked, disabled });
  } catch (error) {
    console.error('push-receipts failed:', error);
    return json({ ok: false, error: 'Push receipt check failed' }, 500);
  }
});
