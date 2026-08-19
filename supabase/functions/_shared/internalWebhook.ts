function decodeJwtPayload(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { role?: unknown };
  } catch {
    return null;
  }
}

// New-style secret keys are opaque, not JWTs — no dots, no claims — so
// decodeJwtPayload can never classify one. Accepting the prefix is what lets the
// legacy service_role JWT be retired: the webhook bearer in Vault becomes an
// `sb_secret_*` key, and without this the three handlers below would answer 403
// and the triggers would fail silently (they warn rather than raise).
//
// Trusting the prefix is safe for the same reason the JWT branch trusts its
// claim: the gateway has already verified the key is valid for this project
// before any of this runs. What is left to do is reject the credentials a
// browser could be holding — a user/anon JWT, or a publishable key, which is
// prefixed `sb_publishable_` and so does not match.
const SECRET_KEY_PREFIX = 'sb_secret_';

/**
 * Supabase's gateway verifies the bearer before this runs. These database-webhook
 * handlers must additionally reject browser anon/user JWTs and publishable keys.
 */
export function hasServiceRoleBearer(req: Request) {
  const authorization = req.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const token = match[1].trim();
  if (token.startsWith(SECRET_KEY_PREFIX)) return true;

  return decodeJwtPayload(token)?.role === 'service_role';
}
