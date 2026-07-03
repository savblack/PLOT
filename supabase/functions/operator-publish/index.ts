import {
  createOperatorClient,
  handleOptions,
  json,
  readBody,
  requireOperatorAuth,
} from '../_shared/operator.ts';
import { runOperatorPublishPass } from '../_shared/operator-publish.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (!requireOperatorAuth(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    const supabase = createOperatorClient();
    const body = req.method === 'POST' ? await readBody(req) : {};
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === '1' || body.dryRun === true;
    const postId = String(body.postId || url.searchParams.get('postId') || '').trim() || undefined;
    const results = await runOperatorPublishPass(supabase, { postId, dryRun });
    return json({ ok: true, results });
  } catch (error) {
    return json({ error: String((error as Error).message || error) }, 500);
  }
});
