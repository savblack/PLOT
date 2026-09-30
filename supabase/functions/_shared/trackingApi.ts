import { serviceKey } from './serviceKey.ts';

/** Server-only access to the additive tracking schema. Each RPC has its own
 * SQL privilege boundary; user controls retain the caller's JWT. */
export async function trackingRequest(path: string, method = 'GET', body?: unknown, authorization?: string) {
  const key = authorization ? Deno.env.get('SUPABASE_ANON_KEY') || '' : serviceKey();
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: authorization || `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Tracking storage request failed (${response.status}). Retry or reconnect.`);
  return response.status === 204 ? null : response.json();
}

export async function outgoingTrackingAllowed(integrationId: string, userId: string) {
  // No implicit outgoing consent, including for accounts connected previously.
  if (Deno.env.get('TRACKING_OUTGOING_ENABLED') !== 'true') return false;
  const rows = await trackingRequest(`tracking_connections?integration_id=eq.${encodeURIComponent(integrationId)}&user_id=eq.${encodeURIComponent(userId)}&select=outgoing_enabled`);
  if (!rows?.[0]?.outgoing_enabled) return false;
  return await trackingRequest('rpc/is_premium', 'POST', { p_user: userId }) === true;
}

/** Pilot workers may touch only explicitly approved accounts. Public rollout is
 * a separate switch from installing the job infrastructure. */
export function trackingPilotUsers(): string[] | null {
  if (Deno.env.get('TRACKING_PUBLIC_ENABLED') === 'true') return null;
  return (Deno.env.get('TRACKING_PILOT_USER_IDS') || '').split(',').map(value => value.trim())
    .filter(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}
export function trackingUserAllowed(userId: string) {
  const users = trackingPilotUsers();
  return users === null || users.includes(userId);
}
