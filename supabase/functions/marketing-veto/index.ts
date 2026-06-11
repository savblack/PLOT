/**
 * marketing-veto
 *
 * Veto link target from the nightly marketing digest email.
 * GET  -> small confirmation page (absorbs email-scanner prefetches, which
 *         would otherwise silently veto posts).
 * POST -> performs the veto: post must be pending_review, token must match,
 *         veto window must still be open.
 *
 * Deploy with --no-verify-jwt: the veto token is the auth.
 * Required env (auto-provided by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const timingSafeEqual = (a: string, b: string): boolean => {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
};

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #F4F4F5; color: #09090B;
             display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .box { background: #fff; border-radius: 16px; padding: 36px; max-width: 420px; text-align: center;
             box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
      h1 { font-size: 1.2rem; margin: 0 0 10px; }
      p { color: #52525B; font-size: 0.95rem; line-height: 1.5; }
      button { background: #E05578; color: #fff; border: none; border-radius: 9999px;
               padding: 12px 28px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 14px; }
    </style></head><body><div class="box">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

// The confirm button POSTs to this same URL, then reloads so the GET shows
// the post-veto state. No response HTML is ever injected into the page.
const CONFIRM_SCRIPT = `fetch(location.href,{method:'POST'}).then(()=>location.reload())`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const postId = url.searchParams.get('post') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!postId || !token) return page('PLOT', '<h1>Missing link parameters</h1>', 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: post } = await supabase
    .from('marketing_posts')
    .select('id, post_type, status, veto_token, veto_expires_at')
    .eq('id', postId)
    .maybeSingle();

  if (!post || !timingSafeEqual(post.veto_token, token)) {
    return page('PLOT', '<h1>Link not valid</h1><p>This veto link is invalid or has been replaced.</p>', 404);
  }

  if (req.method === 'GET') {
    if (post.status === 'vetoed') {
      return page('PLOT', '<h1>Vetoed</h1><p>This post will not be published.</p>');
    }
    if (post.status !== 'pending_review') {
      return page('PLOT', `<h1>Too late to veto</h1><p>This post is already ${post.status}.</p>`);
    }
    return page('PLOT — confirm veto', `
      <h1>Veto this ${post.post_type.replace(/_/g, ' ')} post?</h1>
      <p>It will not be published on any platform.</p>
      <button onclick="${CONFIRM_SCRIPT}">Confirm veto</button>`);
  }

  if (req.method === 'POST') {
    if (post.status !== 'pending_review') {
      return page('PLOT', `<h1>Too late to veto</h1><p>This post is already ${post.status}.</p>`);
    }
    if (post.veto_expires_at && new Date(post.veto_expires_at) < new Date()) {
      return page('PLOT', '<h1>Veto window closed</h1><p>The publish time has passed.</p>');
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('marketing_posts')
      .update({ status: 'vetoed', vetoed_at: now, updated_at: now })
      .eq('id', postId)
      .eq('status', 'pending_review');
    if (error) return page('PLOT', '<h1>Something went wrong</h1><p>Try the link again.</p>', 500);

    await supabase
      .from('marketing_post_publications')
      .update({ status: 'skipped' })
      .eq('post_id', postId)
      .eq('status', 'queued');

    return page('PLOT', '<h1>Vetoed</h1><p>Nothing will be published for this post.</p>');
  }

  return page('PLOT', '<h1>Method not allowed</h1>', 405);
});
