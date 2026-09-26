import { trackingWorkerAuthorized } from './trackingWorkerAuth.ts';
Deno.test('private tracking worker rejects public/user credentials and missing configuration', () => {
  const key='sb_secret_test_only';
  const cases: Record<string,string>[] = [{}, {Authorization:'Bearer user-jwt'}, {apikey:'publishable-test-only'}, {Authorization:`Bearer ${key}suffix`}];
  for (const headers of cases) {
    if (trackingWorkerAuthorized(new Request('https://example.test',{headers}),key)) throw new Error('Unauthorised worker request accepted');
  }
  if (trackingWorkerAuthorized(new Request('https://example.test'),'') ||
    !trackingWorkerAuthorized(new Request('https://example.test',{headers:{apikey:key}}),key) ||
    !trackingWorkerAuthorized(new Request('https://example.test',{headers:{Authorization:`Bearer ${key}`}}),key)) throw new Error('Worker credential boundary failed');
});
