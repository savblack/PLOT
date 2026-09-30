/** Private worker authentication supports both rotated secret API keys and the
 * legacy service-role bearer. A user JWT or publishable key is never enough. */
export function trackingWorkerAuthorized(request: Request, key: string) {
  return !!key && (request.headers.get('apikey') === key || request.headers.get('Authorization') === `Bearer ${key}`);
}
