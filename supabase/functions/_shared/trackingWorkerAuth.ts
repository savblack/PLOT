import { constantTimeEqual } from './serviceBearer.ts';

/** Private worker authentication supports both rotated secret API keys and the
 * legacy service-role bearer. A user JWT or publishable key is never enough.
 * Compared in constant time so response timing leaks nothing about the key. */
export function trackingWorkerAuthorized(request: Request, key: string) {
  if (!key) return false;
  const apikey = request.headers.get('apikey') ?? '';
  const bearer = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  return constantTimeEqual(apikey, key) || constantTimeEqual(bearer, key);
}
