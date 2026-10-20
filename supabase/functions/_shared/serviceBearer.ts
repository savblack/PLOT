// Is this request carrying the project's own service key as its bearer?
//
// For a function deployed with verify_jwt = false the gateway verifies nothing,
// so `hasServiceRoleBearer` (internalWebhook.ts), which trusts a key's prefix
// or an unverified JWT claim, is not enough: anyone could send
// `Bearer sb_secret_anything`. This compares the bearer to the key the function
// itself holds, byte for byte, in constant time.
import { serviceKey } from './serviceKey.ts';

export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
  return diff === 0;
}

export function hasServiceKeyBearer(req: Request, key: string = serviceKey()): boolean {
  if (!key) return false;
  const match = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return constantTimeEqual(match[1].trim(), key);
}
