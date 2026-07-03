import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  buildLegacyCopy,
  buildOperatorVariants,
  derivePostState,
  mapOperatorStateToLegacy,
  normalizeOperatorContent,
  OPERATOR_CHANNELS,
  operatorPostFromMarketingPost,
  postSlug,
} from '../../../control-desk/shared/model.mjs';

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-operator-sync-secret, x-operator-token',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPERATOR_TOKEN = Deno.env.get('OPERATOR_ADMIN_TOKEN')
  || Deno.env.get('ADMIN_TOKEN')
  || Deno.env.get('ADMIN_PASSWORD')
  || '';
const SYNC_SECRET = Deno.env.get('OPERATOR_SYNC_SECRET') ?? '';

const nowIso = () => new Date().toISOString();

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const graphSelect = [
  'id',
  'source',
  'state',
  'topic_key',
  'legacy_post_type',
  'scheduled_for',
  'content',
  'payload',
  'tmdb_refs',
  'created_by',
  'approved_by',
  'approved_at',
  'rejected_by',
  'rejected_at',
  'created_at',
  'updated_at',
  'operator_post_channel_variants(*)',
  'operator_post_media(*)',
  'operator_approval_decisions(*)',
  'operator_post_notes(*)',
  'operator_sync_links(*)',
].join(',');

const adminClient = () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
};

export const createOperatorClient = adminClient;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
  });

export const handleOptions = (req: Request) => {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders });
};

const authToken = (req: Request) => {
  const bearer = req.headers.get('authorization') || '';
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  return req.headers.get('x-operator-token') || '';
};

export const requireOperatorAuth = (req: Request) =>
  !!OPERATOR_TOKEN && authToken(req) === OPERATOR_TOKEN;

export const requireSyncAuth = (req: Request) =>
  !!SYNC_SECRET && req.headers.get('x-operator-sync-secret') === SYNC_SECRET;

export const readBody = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const sortGraph = (post: Record<string, unknown>) => {
  post.operator_post_channel_variants = [...((post.operator_post_channel_variants as unknown[]) || [])]
    .sort((a: any, b: any) => OPERATOR_CHANNELS.indexOf(a.platform) - OPERATOR_CHANNELS.indexOf(b.platform));
  post.operator_post_media = [...((post.operator_post_media as unknown[]) || [])]
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
  post.operator_post_notes = [...((post.operator_post_notes as unknown[]) || [])]
    .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  post.operator_approval_decisions = [...((post.operator_approval_decisions as unknown[]) || [])]
    .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  post.operator_sync_links = [...((post.operator_sync_links as unknown[]) || [])]
    .sort((a: any, b: any) => String(a.source_system || '').localeCompare(String(b.source_system || '')));
  return post;
};

export const loadOperatorPost = async (supabase: ReturnType<typeof createClient>, postId: string) => {
  const { data, error } = await supabase
    .from('operator_posts')
    .select(graphSelect)
    .eq('id', postId)
    .single();
  if (error) throw new Error(error.message);
  return sortGraph(data as Record<string, unknown>);
};

export const listOperatorPosts = async (
  supabase: ReturnType<typeof createClient>,
  {
    states,
    from,
    to,
    limit = 200,
  }: { states?: string[]; from?: string; to?: string; limit?: number } = {},
) => {
  let query = supabase
    .from('operator_posts')
    .select(graphSelect)
    .order('scheduled_for', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (states?.length) query = query.in('state', states);
  if (from) query = query.gte('scheduled_for', from);
  if (to) query = query.lte('scheduled_for', to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((post) => sortGraph(post as Record<string, unknown>));
};

const uniquePlatforms = (variants: Array<Record<string, unknown>>) =>
  [...new Set(variants.map((entry) => entry.platform).filter(Boolean))];

const mergeVariantRows = (
  requestedVariants: Array<Record<string, unknown>>,
  existingVariants: Array<Record<string, unknown>>,
  scheduledFor: string | null,
) => {
  const existingMap = new Map(existingVariants.map((entry) => [entry.platform, entry]));
  const requestedPlatforms = new Set(uniquePlatforms(requestedVariants));
  const rows = requestedVariants.map((entry) => {
    const existing = existingMap.get(entry.platform) || {};
    const status = asText(entry.status) || asText(existing.status) || 'draft';
    return {
      id: existing.id || undefined,
      platform: entry.platform,
      enabled: entry.enabled !== false,
      text_override: asText(entry.text_override) || null,
      first_comment: asText(entry.first_comment) || null,
      status,
      scheduled_for: entry.scheduled_for || existing.scheduled_for || scheduledFor,
      platform_post_id: existing.platform_post_id || null,
      permalink: existing.permalink || null,
      last_error: existing.last_error || null,
      attempt_count: Number(existing.attempt_count || 0),
      sent_payload: existing.sent_payload || null,
      published_at: existing.published_at || null,
      updated_at: nowIso(),
    };
  });

  for (const existing of existingVariants) {
    if (requestedPlatforms.has(existing.platform)) continue;
    rows.push({
      id: existing.id,
      platform: existing.platform,
      enabled: false,
      text_override: existing.text_override || null,
      first_comment: existing.first_comment || null,
      status: existing.status === 'published' ? 'published' : 'draft',
      scheduled_for: existing.scheduled_for || scheduledFor,
      platform_post_id: existing.platform_post_id || null,
      permalink: existing.permalink || null,
      last_error: existing.last_error || null,
      attempt_count: Number(existing.attempt_count || 0),
      sent_payload: existing.sent_payload || null,
      published_at: existing.published_at || null,
      updated_at: nowIso(),
    });
  }

  return rows;
};

const stripUndefinedIds = (rows: Array<Record<string, unknown>>) =>
  rows.map((row) => {
    if (row.id) return row;
    const { id, ...rest } = row;
    return rest;
  });

const normalizeMedia = (media: Array<Record<string, unknown>> = []) =>
  media.map((entry, index) => ({
    sort_order: Number(entry.sort_order ?? index),
    portrait_path: asText(entry.portrait_path) || null,
    landscape_path: asText(entry.landscape_path) || null,
    channels: entry.channels || OPERATOR_CHANNELS,
  }));

const syncLinkInput = (input: Record<string, unknown>, existingLink: Record<string, unknown> | undefined) => {
  const provided = (input.sync_link || {}) as Record<string, unknown>;
  const externalId = asText(provided.external_id) || asText(input.legacy_post_id) || asText(existingLink?.external_id);
  const legacyPostId = asText(provided.legacy_post_id) || asText(input.legacy_post_id) || asText(existingLink?.legacy_post_id);
  if (!externalId && !legacyPostId) return null;
  return {
    source_system: 'marketing',
    external_id: externalId || legacyPostId,
    legacy_post_id: legacyPostId || null,
  };
};

export const saveOperatorGraph = async (
  supabase: ReturnType<typeof createClient>,
  rawInput: Record<string, unknown>,
) => {
  const input = rawInput || {};
  const existing = asText(input.id) ? await loadOperatorPost(supabase, asText(input.id)) : null;
  const content = normalizeOperatorContent((input.content || input.copy || existing?.content || {}) as Record<string, unknown>);
  const source = asText(input.source) || String(existing?.source || 'manual');
  const scheduledFor = asText(input.scheduled_for) || String(existing?.scheduled_for || '') || null;
  const requestedVariants = buildOperatorVariants({
    content,
    variants: (input.variants as Array<Record<string, unknown>>) || (existing?.operator_post_channel_variants as Array<Record<string, unknown>>) || [],
    platforms: input.platforms as string[] | undefined,
    scheduled_for: scheduledFor,
  });

  const row = {
    source,
    state: asText(input.state) || String(existing?.state || 'draft'),
    topic_key: asText(input.topic_key) || (existing?.topic_key as string | null) || null,
    legacy_post_type: asText(input.legacy_post_type) || String(existing?.legacy_post_type || (source === 'manual' ? 'guide' : 'guide')),
    scheduled_for: scheduledFor,
    content,
    payload: (input.payload || existing?.payload || {}) as Record<string, unknown>,
    tmdb_refs: (input.tmdb_refs || existing?.tmdb_refs || []) as unknown[],
    created_by: asText(input.created_by) || (existing?.created_by as string | null) || null,
    updated_at: nowIso(),
  };

  let postId = asText(input.id);
  if (postId) {
    const { error } = await supabase.from('operator_posts').update(row).eq('id', postId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from('operator_posts').insert(row).select('id').single();
    if (error) throw new Error(error.message);
    postId = data.id;
  }

  const mergedVariants = stripUndefinedIds(mergeVariantRows(
    requestedVariants,
    ((existing?.operator_post_channel_variants as Array<Record<string, unknown>>) || []),
    scheduledFor,
  )).map((entry) => ({ ...entry, post_id: postId }));

  if (mergedVariants.length) {
    const { error } = await supabase
      .from('operator_post_channel_variants')
      .upsert(mergedVariants, { onConflict: 'post_id,platform' });
    if (error) throw new Error(error.message);
  }

  const { error: deleteMediaError } = await supabase
    .from('operator_post_media')
    .delete()
    .eq('post_id', postId);
  if (deleteMediaError) throw new Error(deleteMediaError.message);

  const media = normalizeMedia((input.media as Array<Record<string, unknown>>) || ((existing?.operator_post_media as Array<Record<string, unknown>>) || []));
  if (media.length) {
    const { error } = await supabase
      .from('operator_post_media')
      .insert(media.map((entry) => ({ ...entry, post_id: postId })));
    if (error) throw new Error(error.message);
  }

  const existingLink = ((existing?.operator_sync_links as Array<Record<string, unknown>>) || [])[0];
  const syncLink = syncLinkInput(input, existingLink);
  if (syncLink) {
    const { error } = await supabase
      .from('operator_sync_links')
      .upsert({ ...syncLink, post_id: postId, updated_at: nowIso() }, { onConflict: 'post_id,source_system' });
    if (error) throw new Error(error.message);
  }

  const noteBody = asText(input.note_body);
  if (noteBody) {
    const { error } = await supabase
      .from('operator_post_notes')
      .insert({ post_id: postId, actor: asText(input.actor) || null, body: noteBody });
    if (error) throw new Error(error.message);
  }

  await refreshOperatorPostState(supabase, postId, row.state);
  return await loadOperatorPost(supabase, postId);
};

const legacyPublicationStatus = (variant: Record<string, unknown>) => {
  if (variant.enabled === false) return 'skipped';
  if (variant.status === 'published') return 'published';
  if (variant.status === 'failed') return 'failed';
  if (variant.status === 'rejected') return 'skipped';
  return 'queued';
};

export const syncLegacyProjection = async (
  supabase: ReturnType<typeof createClient>,
  postId: string,
) => {
  const post = await loadOperatorPost(supabase, postId);
  const content = buildLegacyCopy(post.content as Record<string, unknown>);
  const variants = ((post.operator_post_channel_variants as Array<Record<string, unknown>>) || [])
    .filter((entry) => entry.enabled !== false);
  const media = ((post.operator_post_media as Array<Record<string, unknown>>) || []).map((entry: any) => ({
    portrait_path: entry.portrait_path || null,
    landscape_path: entry.landscape_path || null,
    channels: entry.channels || OPERATOR_CHANNELS,
  }));
  const legacyStatus = mapOperatorStateToLegacy(String(post.state || 'draft'), variants);
  const scheduledFor = String(post.scheduled_for || nowIso());
  const slug = content.page_title && String(post.legacy_post_type || '') !== 'question'
    ? postSlug(content.page_title, scheduledFor)
    : null;

  const marketingLink = ((post.operator_sync_links as Array<Record<string, unknown>>) || [])
    .find((entry) => entry.source_system === 'marketing');

  let legacyPostId = asText(marketingLink?.legacy_post_id);
  const legacyRow = {
    post_type: String(post.legacy_post_type || 'guide'),
    topic_key: asText(post.topic_key) || `operator:${post.id}`,
    status: legacyStatus,
    scheduled_for: scheduledFor,
    tmdb_refs: (post.tmdb_refs || []) as unknown[],
    payload: (post.payload || {}) as Record<string, unknown>,
    copy: content,
    media,
    slug,
    updated_at: nowIso(),
    error: legacyStatus === 'failed' ? 'Operator publish failed' : null,
  };

  if (legacyPostId) {
    const { error } = await supabase
      .from('marketing_posts')
      .update(legacyRow)
      .eq('id', legacyPostId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from('marketing_posts')
      .insert(legacyRow)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    legacyPostId = data.id;
    const linkPayload = {
      post_id: post.id,
      source_system: 'marketing',
      external_id: legacyPostId,
      legacy_post_id: legacyPostId,
      updated_at: nowIso(),
    };
    const { error: linkError } = await supabase
      .from('operator_sync_links')
      .upsert(linkPayload, { onConflict: 'post_id,source_system' });
    if (linkError) throw new Error(linkError.message);
  }

  const { data: currentPubs } = await supabase
    .from('marketing_post_publications')
    .select('id, platform')
    .eq('post_id', legacyPostId);
  const currentByPlatform = new Map((currentPubs || []).map((entry) => [entry.platform, entry]));

  const upserts = stripUndefinedIds(variants.map((variant) => ({
    id: currentByPlatform.get(variant.platform)?.id,
    post_id: legacyPostId,
    platform: variant.platform,
    status: legacyPublicationStatus(variant),
    platform_post_id: variant.platform_post_id || null,
    permalink: variant.permalink || null,
    published_at: variant.published_at || null,
    error: variant.last_error || null,
    attempt_count: Number(variant.attempt_count || 0),
  })));

  if (upserts.length) {
    const { error } = await supabase
      .from('marketing_post_publications')
      .upsert(upserts, { onConflict: 'post_id,platform' });
    if (error) throw new Error(error.message);
  }

  const disabledPlatforms = ((post.operator_post_channel_variants as Array<Record<string, unknown>>) || [])
    .filter((entry) => entry.enabled === false)
    .map((entry) => entry.platform);
  if (disabledPlatforms.length) {
    await supabase
      .from('marketing_post_publications')
      .update({ status: 'skipped', error: null })
      .eq('post_id', legacyPostId)
      .in('platform', disabledPlatforms);
  }

  return legacyPostId;
};

export const refreshOperatorPostState = async (
  supabase: ReturnType<typeof createClient>,
  postId: string,
  fallbackState?: string,
) => {
  const post = await loadOperatorPost(supabase, postId);
  const nextState = derivePostState(
    fallbackState || String(post.state || 'draft'),
    (post.operator_post_channel_variants as Array<Record<string, unknown>>) || [],
    String(post.scheduled_for || ''),
  );
  if (nextState !== post.state) {
    const { error } = await supabase
      .from('operator_posts')
      .update({ state: nextState, updated_at: nowIso() })
      .eq('id', postId);
    if (error) throw new Error(error.message);
  }
  await syncLegacyProjection(supabase, postId);
  return await loadOperatorPost(supabase, postId);
};

export const recordDecision = async (
  supabase: ReturnType<typeof createClient>,
  postId: string,
  decision: 'submitted' | 'approved' | 'rejected',
  actor: string,
  note = '',
) => {
  const { error } = await supabase
    .from('operator_approval_decisions')
    .insert({ post_id: postId, decision, actor: actor || null, note: note || null });
  if (error) throw new Error(error.message);
};

export const setVariantStatus = async (
  supabase: ReturnType<typeof createClient>,
  postId: string,
  status: string,
  filterStatuses?: string[],
) => {
  let query = supabase
    .from('operator_post_channel_variants')
    .update({ status, scheduled_for: null, updated_at: nowIso() })
    .eq('post_id', postId)
    .eq('enabled', true);
  if (filterStatuses?.length) query = query.in('status', filterStatuses);
  const { error } = await query;
  if (error) throw new Error(error.message);
};

export const submitMarketingPostToOperator = async (
  supabase: ReturnType<typeof createClient>,
  marketingPost: Record<string, unknown>,
) => saveOperatorGraph(supabase, operatorPostFromMarketingPost(marketingPost));
