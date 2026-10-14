// Is this request carrying one of the project's own full-privilege keys?
//
// Until 2026-10-14 this trusted what the bearer *said* it was: an `sb_secret_`
// prefix, or an unverified JWT whose payload claimed `role: service_role`. That
// was safe only because every caller is deployed with verify_jwt = true, so the
// gateway had already validated the credential. One `--no-verify-jwt` deploy
// would have turned the gate into string matching anyone could pass. The
// 2026-10-13 security review flagged it.
//
// Now the bearer must equal, byte for byte, a key the function itself holds:
// SB_SECRET_KEY (the rotated secret key) or the platform-injected
// SUPABASE_SERVICE_ROLE_KEY. Both are what the Vault bearer the database
// webhooks send has ever been. Compared in constant time.
import { constantTimeEqual } from './serviceBearer.ts';

function candidateKeys(): string[] {
  return [Deno.env.get('SB_SECRET_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .filter((k): k is string => !!k);
}

/**
 * Database-webhook and cron handlers call this to reject anything a browser
 * could be holding: a user or anon JWT, or a publishable key.
 */
export function hasServiceRoleBearer(req: Request, keys: string[] = candidateKeys()) {
  const match = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1].trim();
  // Check every key so the timing does not reveal which one matched.
  let ok = false;
  for (const key of keys) ok = constantTimeEqual(token, key) || ok;
  return ok;
}
