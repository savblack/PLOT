import {
  createOperatorClient,
  handleOptions,
  json,
  readBody,
  requireSyncAuth,
  submitMarketingPostToOperator,
} from '../_shared/operator.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!requireSyncAuth(req)) return json({ error: 'Unauthorized' }, 401);

  const body = await readBody(req);
  const marketingPost = (body.post || body) as Record<string, unknown>;
  if (!marketingPost?.id) return json({ error: 'Missing marketing post payload' }, 400);

  try {
    const supabase = createOperatorClient();
    const post = await submitMarketingPostToOperator(supabase, marketingPost);
    return json({ ok: true, post });
  } catch (error) {
    return json({ error: String((error as Error).message || error) }, 500);
  }
});
