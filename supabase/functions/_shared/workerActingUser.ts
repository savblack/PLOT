// A private worker acting for one user.
//
// The import-worker runs a user's background import with the service key. For
// a connection source it has to run the same one-off account import that
// trakt-sync / media-sync / simkl-sync already do for a signed-in user, and it
// has no user JWT to send. So those functions accept the service key plus an
// explicit `user_id`, and act for that user. The key is compared byte for byte
// (hasServiceKeyBearer); a user JWT or the publishable key never gets here.
import { hasServiceKeyBearer } from './serviceBearer.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user the worker is acting for, or null when this is an ordinary request. */
export async function workerActingUser(req: Request): Promise<{ id: string } | null> {
  if (req.method !== 'POST' || !hasServiceKeyBearer(req)) return null;
  const body = await req.clone().json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.user_id === 'string' ? body.user_id : '';
  return UUID.test(id) ? { id } : null;
}
