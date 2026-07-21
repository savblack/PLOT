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

/**
 * Supabase's gateway verifies the JWT signature before this runs. These
 * database-webhook handlers must additionally reject browser anon/user JWTs.
 */
export function hasServiceRoleBearer(req: Request) {
  const authorization = req.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? decodeJwtPayload(match[1])?.role === 'service_role' : false;
}
