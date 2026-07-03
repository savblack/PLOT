import {
  createOperatorClient,
  handleOptions,
  json,
  listOperatorPosts,
  loadOperatorPost,
  readBody,
  recordDecision,
  refreshOperatorPostState,
  requireOperatorAuth,
  saveOperatorGraph,
  setVariantStatus,
} from '../_shared/operator.ts';
import { buildOperatorNewsletterPreview } from '../_shared/operator-newsletter.ts';
import { runOperatorPublishPass } from '../_shared/operator-publish.ts';

const nowIso = () => new Date().toISOString();

const actorName = (body: Record<string, unknown>) =>
  String(body.actor || body.user || 'operator').trim();

const patchPost = async (supabase: any, postId: string, patch: Record<string, unknown>) => {
  const { error } = await supabase
    .from('operator_posts')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', postId);
  if (error) throw new Error(error.message);
};

const decodeDataUrl = (dataUrl: string) => {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid upload payload');
  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { mimeType, bytes };
};

const safeFilename = (name: string) =>
  String(name || 'upload')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'upload';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (!requireOperatorAuth(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createOperatorClient();
  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      const view = url.searchParams.get('view') || '';
      if (view === 'newsletter') {
        const newsletter = await buildOperatorNewsletterPreview(supabase);
        return json({ newsletter });
      }
      const states = view === 'drafts'
        ? ['draft', 'in_review', 'rejected']
        : view === 'queue'
          ? ['approved', 'scheduled', 'publishing', 'published', 'failed']
          : undefined;
      const posts = await listOperatorPosts(supabase, {
        states,
        from: url.searchParams.get('from') || undefined,
        to: url.searchParams.get('to') || undefined,
      });
      const { data: channels } = await supabase
        .from('operator_channel_accounts')
        .select('*')
        .eq('is_active', true)
        .order('platform');
      return json({ posts, channels: channels || [] });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const body = (await readBody(req)) as Record<string, unknown>;
    const action = String(body.action || 'save_post');
    const postId = String(body.postId || body.id || body.post?.id || '').trim();
    const actor = actorName(body);

    if (action === 'save_post') {
      const post = await saveOperatorGraph(supabase, {
        ...(body.post as Record<string, unknown> || {}),
        actor,
      });
      return json({ ok: true, post });
    }

    if (!postId) return json({ error: 'Missing postId' }, 400);

    if (action === 'submit_review') {
      await patchPost(supabase, postId, { state: 'in_review' });
      await recordDecision(supabase, postId, 'submitted', actor, String(body.note || ''));
      const post = await refreshOperatorPostState(supabase, postId, 'in_review');
      return json({ ok: true, post });
    }

    if (action === 'approve_post') {
      const post = await loadOperatorPost(supabase, postId);
      const scheduledFor = String(body.scheduled_for || post.scheduled_for || nowIso());
      await patchPost(supabase, postId, {
        state: new Date(scheduledFor).getTime() > Date.now() ? 'scheduled' : 'approved',
        scheduled_for: scheduledFor,
        approved_by: actor,
        approved_at: nowIso(),
        rejected_by: null,
        rejected_at: null,
      });
      await setVariantStatus(supabase, postId, 'scheduled', ['draft', 'failed', 'rejected', 'scheduled']);
      await recordDecision(supabase, postId, 'approved', actor, String(body.note || ''));
      const refreshed = await refreshOperatorPostState(supabase, postId, 'approved');
      return json({ ok: true, post: refreshed });
    }

    if (action === 'reject_post') {
      await patchPost(supabase, postId, {
        state: 'rejected',
        rejected_by: actor,
        rejected_at: nowIso(),
      });
      await setVariantStatus(supabase, postId, 'rejected');
      await recordDecision(supabase, postId, 'rejected', actor, String(body.note || ''));
      const post = await refreshOperatorPostState(supabase, postId, 'rejected');
      return json({ ok: true, post });
    }

    if (action === 'schedule_post') {
      const scheduledFor = String(body.scheduled_for || '').trim();
      if (!scheduledFor) return json({ error: 'Missing scheduled_for' }, 400);
      await patchPost(supabase, postId, { state: 'scheduled', scheduled_for: scheduledFor });
      const { error } = await supabase
        .from('operator_post_channel_variants')
        .update({ status: 'scheduled', scheduled_for: scheduledFor, updated_at: nowIso() })
        .eq('post_id', postId)
        .eq('enabled', true);
      if (error) throw new Error(error.message);
      const post = await refreshOperatorPostState(supabase, postId, 'scheduled');
      return json({ ok: true, post });
    }

    if (action === 'publish_now') {
      await patchPost(supabase, postId, {
        state: 'approved',
        scheduled_for: nowIso(),
        approved_by: actor,
        approved_at: nowIso(),
      });
      const { error } = await supabase
        .from('operator_post_channel_variants')
        .update({ status: 'scheduled', scheduled_for: nowIso(), updated_at: nowIso() })
        .eq('post_id', postId)
        .eq('enabled', true);
      if (error) throw new Error(error.message);
      const results = await runOperatorPublishPass(supabase, { postId });
      const post = await loadOperatorPost(supabase, postId);
      return json({ ok: true, post, results });
    }

    if (action === 'retry_post') {
      const { error } = await supabase
        .from('operator_post_channel_variants')
        .update({ status: 'scheduled', last_error: null, updated_at: nowIso() })
        .eq('post_id', postId)
        .eq('status', 'failed');
      if (error) throw new Error(error.message);
      await patchPost(supabase, postId, { state: 'approved' });
      const post = await refreshOperatorPostState(supabase, postId, 'approved');
      return json({ ok: true, post });
    }

    if (action === 'add_note') {
      const post = await saveOperatorGraph(supabase, {
        id: postId,
        note_body: body.body,
        actor,
      });
      return json({ ok: true, post });
    }

    if (action === 'upload_media') {
      const dataUrl = String(body.dataUrl || '').trim();
      if (!dataUrl) return json({ error: 'Missing dataUrl' }, 400);
      const { mimeType, bytes } = decodeDataUrl(dataUrl);
      const filename = safeFilename(String(body.filename || 'upload'));
      const storagePath = `operator/${postId}/${Date.now()}-${filename}`;
      const { error } = await supabase.storage
        .from('marketing')
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (error) throw new Error(error.message);

      const post = await loadOperatorPost(supabase, postId);
      const next = await saveOperatorGraph(supabase, {
        id: postId,
        source: post.source,
        state: post.state,
        topic_key: post.topic_key,
        legacy_post_type: post.legacy_post_type,
        scheduled_for: post.scheduled_for,
        content: post.content,
        payload: post.payload,
        tmdb_refs: post.tmdb_refs,
        variants: post.operator_post_channel_variants,
        media: [
          ...(post.operator_post_media || []),
          {
            sort_order: (post.operator_post_media || []).length,
            portrait_path: storagePath,
            landscape_path: storagePath,
            channels: ['x', 'instagram', 'threads'],
          },
        ],
      });
      return json({ ok: true, post: next });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (error) {
    return json({ error: String((error as Error).message || error) }, 500);
  }
});
