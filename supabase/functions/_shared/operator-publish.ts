import {
  buildLegacyCopy,
  OPERATOR_CHANNELS,
  postSlug,
} from '../../../control-desk/shared/model.mjs';
import {
  loadOperatorPost,
  refreshOperatorPostState,
} from './operator.ts';

const API_URL = 'https://api.buffer.com';
const BUFFER_API_KEY = Deno.env.get('BUFFER_API_KEY') ?? '';
const SITE_URL = 'https://theplot.tv';

const SERVICE = { x: 'twitter', instagram: 'instagram', threads: 'threads' };

const str = (value: unknown) => JSON.stringify(String(value ?? ''));

const gql = async (query: string) => {
  if (!BUFFER_API_KEY) throw new Error('BUFFER_API_KEY is not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BUFFER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) {
    throw new Error(`Buffer API ${res.status}: ${data.errors?.[0]?.message || JSON.stringify(data)}`);
  }
  return data.data;
};

let channelsPromise: Promise<Record<string, string>> | null = null;

const getChannels = () => (channelsPromise ??= (async () => {
  const { account } = await gql('query { account { organizations { id } } }');
  const map: Record<string, string> = {};
  for (const org of account?.organizations || []) {
    const { channels } = await gql(
      `query { channels(input: { organizationId: ${str(org.id)} }) { id service isLocked isDisconnected } }`,
    );
    for (const channel of channels || []) {
      if (!channel.isLocked && !channel.isDisconnected && !map[channel.service]) {
        map[channel.service] = channel.id;
      }
    }
  }
  return map;
})());

const channelFor = async (service: string) => {
  const override = Deno.env.get(`BUFFER_CHANNEL_${service.toUpperCase()}`);
  if (override) return override;
  const id = (await getChannels())[service];
  if (!id) throw new Error(`No connected Buffer channel for service "${service}"`);
  return id;
};

const publicUrl = (path: string | null) =>
  path ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/marketing/${path}` : null;

const cardsFor = (media: Array<Record<string, unknown>>, platform: string) =>
  media.filter((entry) => !entry.channels || entry.channels.includes(platform));

const feedLink = (post: Record<string, unknown>, copy: Record<string, unknown>) => {
  if (post.legacy_post_type === 'trending') {
    return `${SITE_URL}/whats-on/chart?utm_source=threads&utm_medium=organic_social`;
  }
  if (!copy.page_title || !post.scheduled_for) return null;
  const slug = postSlug(copy.page_title, String(post.scheduled_for));
  return `${SITE_URL}/whats-on/${slug}?utm_source=threads&utm_medium=organic_social`;
};

const buildPublishPayload = (
  post: Record<string, unknown>,
  variant: Record<string, unknown>,
) => {
  const media = (post.operator_post_media as Array<Record<string, unknown>>) || [];
  const copy = buildLegacyCopy(post.content as Record<string, unknown>);
  if (variant.platform === 'x') {
    const hero = cardsFor(media, 'x')[0] || media[0];
    return {
      service: SERVICE.x,
      text: copy.x,
      imageUrls: hero?.landscape_path ? [publicUrl(String(hero.landscape_path))] : [],
      altText: copy.alt_text || null,
      firstComment: variant.first_comment || copy.first_comment || null,
    };
  }
  if (variant.platform === 'instagram') {
    const hashtags = (copy.hashtags || []).map((tag: string) => `#${tag.replace(/^#/, '')}`).join(' ');
    return {
      service: SERVICE.instagram,
      text: hashtags ? `${copy.instagram}\n\n${hashtags}` : copy.instagram,
      imageUrls: cardsFor(media, 'instagram').map((entry) => publicUrl(String(entry.portrait_path))).filter(Boolean),
      altText: copy.alt_text || null,
      firstComment: variant.first_comment || copy.first_comment || null,
    };
  }
  const link = feedLink(post, copy);
  return {
    service: SERVICE.threads,
    text: link ? `${copy.threads}\n\n${link}` : copy.threads,
    imageUrls: cardsFor(media, 'threads').map((entry) => publicUrl(String(entry.landscape_path))).filter(Boolean),
    altText: copy.alt_text || null,
    firstComment: variant.first_comment || copy.first_comment || null,
  };
};

const publishToBuffer = async ({
  service,
  text,
  imageUrls,
  altText,
}: {
  service: string;
  text: string;
  imageUrls: string[];
  altText?: string | null;
}) => {
  const assets = imageUrls.map((url, index) =>
    `{ image: { url: ${str(url)}${index === 0 && altText ? `, metadata: { altText: ${str(altText)} }` : ''} } }`);
  const channelId = await channelFor(service);
  const metaField = service === 'instagram'
    ? ', metadata: { instagram: { type: post, shouldShareToFeed: true } }'
    : '';
  const mutation = `mutation {
    createPost(input: {
      channelId: ${str(channelId)},
      schedulingType: automatic,
      mode: shareNow${metaField},
      text: ${str(text)},
      assets: [${assets.join(', ')}]
    }) {
      ... on PostActionSuccess { post { id externalLink } }
      ... on MutationError { message }
    }
  }`;
  const data = await gql(mutation);
  const result = data?.createPost;
  if (!result?.post) throw new Error(`Buffer createPost failed: ${result?.message || 'unknown error'}`);
  return {
    platform_post_id: result.post.id,
    permalink: result.post.externalLink || null,
  };
};

const claimVariant = async (supabase: any, variantId: string) => {
  const { data } = await supabase
    .from('operator_post_channel_variants')
    .update({ status: 'publishing', updated_at: new Date().toISOString() })
    .eq('id', variantId)
    .in('status', ['scheduled', 'failed'])
    .select('id');
  return !!data?.length;
};

const syncVariantPatch = async (supabase: any, variantId: string, patch: Record<string, unknown>) => {
  const { error } = await supabase
    .from('operator_post_channel_variants')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', variantId);
  if (error) throw new Error(error.message);
};

const recordAttempt = async (
  supabase: any,
  postId: string,
  platform: string,
  status: 'published' | 'failed',
  payload: Record<string, unknown>,
  responsePayload: Record<string, unknown> | null,
  errorText: string | null,
) => {
  const { error } = await supabase
    .from('operator_publish_attempts')
    .insert({
      post_id: postId,
      platform,
      status,
      sent_text: payload.text || null,
      sent_payload: payload,
      response_payload: responsePayload,
      error: errorText,
    });
  if (error) throw new Error(error.message);
};

const publishVariant = async (supabase: any, post: Record<string, unknown>, variant: Record<string, unknown>, dryRun: boolean) => {
  if (!(await claimVariant(supabase, String(variant.id)))) return;
  const payload = buildPublishPayload(post, variant);
  try {
    const result = dryRun
      ? { platform_post_id: null, permalink: null, dry_run: true }
      : await publishToBuffer(payload as any);
    await syncVariantPatch(supabase, String(variant.id), {
      status: dryRun ? 'scheduled' : 'published',
      platform_post_id: result.platform_post_id,
      permalink: result.permalink,
      last_error: dryRun ? null : null,
      attempt_count: Number(variant.attempt_count || 0) + 1,
      sent_payload: { ...payload, dry_run: dryRun },
      published_at: dryRun ? null : new Date().toISOString(),
    });
    await recordAttempt(
      supabase,
      String(post.id),
      String(variant.platform),
      'published',
      { ...payload, first_comment: payload.firstComment || null },
      result,
      null,
    );
  } catch (error) {
    const message = String((error as Error).message || error);
    await syncVariantPatch(supabase, String(variant.id), {
      status: 'failed',
      last_error: message.slice(0, 500),
      attempt_count: Number(variant.attempt_count || 0) + 1,
      sent_payload: payload,
    });
    await recordAttempt(
      supabase,
      String(post.id),
      String(variant.platform),
      'failed',
      { ...payload, first_comment: payload.firstComment || null },
      null,
      message.slice(0, 500),
    );
  }
};

export const runOperatorPublishPass = async (
  supabase: any,
  {
    postId,
    dryRun = false,
  }: { postId?: string; dryRun?: boolean } = {},
) => {
  let query = supabase
    .from('operator_posts')
    .select('id')
    .in('state', ['approved', 'scheduled', 'failed'])
    .order('scheduled_for', { ascending: true });

  if (postId) query = query.eq('id', postId);
  else query = query.lte('scheduled_for', new Date().toISOString());

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const results = [];
  for (const row of data || []) {
    const post = await loadOperatorPost(supabase, row.id);
    const enabled = ((post.operator_post_channel_variants as Array<Record<string, unknown>>) || [])
      .filter((variant) => variant.enabled !== false)
      .filter((variant) => ['scheduled', 'failed'].includes(String(variant.status || 'draft')));
    for (const variant of enabled) {
      await publishVariant(supabase, post, variant, dryRun);
    }
    const refreshed = await refreshOperatorPostState(supabase, row.id, String(post.state || 'approved'));
    results.push({
      post_id: row.id,
      state: refreshed.state,
      platforms: ((refreshed.operator_post_channel_variants as Array<Record<string, unknown>>) || [])
        .filter((variant) => variant.enabled !== false)
        .map((variant) => ({ platform: variant.platform, status: variant.status })),
    });
  }

  return results;
};
