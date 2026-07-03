export const OPERATOR_CHANNELS = ['x', 'instagram', 'threads'];

export const OPERATOR_STATES = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'rejected',
];

export const OPERATOR_VARIANT_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'rejected',
];

export const PLATFORM_LABELS = {
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
};

const str = (value) => (typeof value === 'string' ? value.trim() : '');

const arr = (value) => (Array.isArray(value) ? value : []);

const sourceList = (value) =>
  arr(value)
    .map((entry) => ({
      title: str(entry?.title) || str(entry?.url),
      url: str(entry?.url),
    }))
    .filter((entry) => /^https?:\/\//i.test(entry.url));

const normalizePageBody = (value) => {
  if (Array.isArray(value)) return value.map(str).filter(Boolean);
  const body = str(value);
  return body ? [body] : [];
};

export const sortPlatforms = (platforms = []) =>
  [...new Set(platforms.filter((platform) => OPERATOR_CHANNELS.includes(platform)))]
    .sort((a, b) => OPERATOR_CHANNELS.indexOf(a) - OPERATOR_CHANNELS.indexOf(b));

export const normalizeOperatorContent = (raw = {}) => {
  const overrideSource = raw.channel_overrides || raw.overrides || {};
  const hashtags = arr(raw.hashtags)
    .map((tag) => String(tag).trim().replace(/^#/, '').replace(/\s+/g, ''))
    .filter(Boolean);
  return {
    shared_text: str(raw.shared_text),
    channel_overrides: {
      x: str(overrideSource.x ?? raw.x),
      instagram: str(overrideSource.instagram ?? raw.instagram),
      threads: str(overrideSource.threads ?? raw.threads),
    },
    hashtags,
    alt_text: str(raw.alt_text),
    cta_variant: str(raw.cta_variant) || 'none',
    page_title: str(raw.page_title),
    page_body: normalizePageBody(raw.page_body),
    sources: sourceList(raw.sources),
    first_comment: str(raw.first_comment),
  };
};

export const contentForPlatform = (content, platform) => {
  const normalized = normalizeOperatorContent(content);
  return normalized.channel_overrides[platform] || normalized.shared_text || '';
};

export const buildLegacyCopy = (content) => {
  const normalized = normalizeOperatorContent(content);
  return {
    x: contentForPlatform(normalized, 'x'),
    instagram: contentForPlatform(normalized, 'instagram'),
    threads: contentForPlatform(normalized, 'threads'),
    hashtags: normalized.hashtags,
    alt_text: normalized.alt_text,
    cta_variant: normalized.cta_variant,
    page_title: normalized.page_title,
    page_body: normalized.page_body,
    sources: normalized.sources,
    first_comment: normalized.first_comment,
  };
};

export const inferPlatformsFromLegacyPost = (post = {}) => {
  const pubs = arr(post.marketing_post_publications).map((entry) => entry?.platform).filter(Boolean);
  if (pubs.length) return sortPlatforms(pubs);
  if (post.post_type === 'question') return ['x', 'threads'];
  return [...OPERATOR_CHANNELS];
};

export const buildOperatorVariants = (input = {}) => {
  const content = normalizeOperatorContent(input.content || input.copy || {});
  const explicitPlatforms = Array.isArray(input.platforms) ? input.platforms : null;
  const variantPlatforms = arr(input.variants).map((entry) => entry?.platform).filter(Boolean);
  const platforms = sortPlatforms(
    explicitPlatforms?.length
      ? explicitPlatforms
      : variantPlatforms.length
        ? variantPlatforms
        : inferPlatformsFromLegacyPost(input),
  );
  return platforms.map((platform) => {
    const existing = arr(input.variants).find((entry) => entry?.platform === platform) || {};
    return {
      platform,
      enabled: existing.enabled ?? true,
      text_override: str(existing.text_override ?? existing.text ?? content.channel_overrides[platform]),
      first_comment: str(existing.first_comment ?? content.first_comment),
      status: OPERATOR_VARIANT_STATUSES.includes(existing.status) ? existing.status : 'draft',
      scheduled_for: existing.scheduled_for || input.scheduled_for || null,
      platform_post_id: existing.platform_post_id || null,
      permalink: existing.permalink || null,
      last_error: existing.last_error || null,
      attempt_count: Number.isFinite(existing.attempt_count) ? existing.attempt_count : 0,
      sent_payload: existing.sent_payload || null,
      published_at: existing.published_at || null,
    };
  });
};

export const operatorPostFromMarketingPost = (post) => ({
  source: 'generated',
  state: 'draft',
  topic_key: post.topic_key,
  legacy_post_type: post.post_type || 'guide',
  scheduled_for: post.scheduled_for,
  payload: post.payload || {},
  tmdb_refs: post.tmdb_refs || [],
  content: normalizeOperatorContent(post.copy || {}),
  variants: buildOperatorVariants(post),
  media: arr(post.media).map((entry, index) => ({
    sort_order: index,
    portrait_path: entry?.portrait_path || null,
    landscape_path: entry?.landscape_path || null,
    channels: sortPlatforms(entry?.channels || OPERATOR_CHANNELS),
  })),
  sync_link: {
    source_system: 'marketing',
    external_id: post.id,
    legacy_post_id: post.id,
  },
});

export const derivePostState = (state, variants = [], scheduledFor = null) => {
  if (state && OPERATOR_STATES.includes(state) && !['approved', 'scheduled', 'failed', 'published'].includes(state)) {
    return state;
  }

  const enabled = variants.filter((entry) => entry.enabled !== false);
  if (!enabled.length) return 'draft';
  const statuses = enabled.map((entry) => entry.status);
  if (statuses.every((status) => status === 'published')) return 'published';
  if (statuses.includes('publishing')) return 'publishing';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.every((status) => status === 'scheduled')) {
    return scheduledFor && new Date(scheduledFor).getTime() > Date.now() ? 'scheduled' : 'approved';
  }
  if (statuses.every((status) => status === 'rejected')) return 'rejected';
  return state && OPERATOR_STATES.includes(state) ? state : 'draft';
};

export const mapOperatorStateToLegacy = (state, variants = []) => {
  if (state === 'published') {
    const published = variants.filter((entry) => entry.enabled !== false && entry.status === 'published').length;
    const enabled = variants.filter((entry) => entry.enabled !== false).length;
    return published === enabled ? 'published' : 'partially_published';
  }
  if (state === 'failed') {
    return variants.some((entry) => entry.enabled !== false && entry.status === 'published')
      ? 'partially_published'
      : 'failed';
  }
  if (state === 'approved' || state === 'scheduled' || state === 'publishing') return 'approved';
  if (state === 'rejected') return 'vetoed';
  return 'generated';
};

export const slugify = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

export const postSlug = (title, scheduledFor) =>
  `${slugify(title)}-${String(scheduledFor).slice(0, 10)}`;

export const weekRange = (anchorDate = new Date()) => {
  const base = new Date(anchorDate);
  const day = base.getUTCDay();
  const diff = (day + 6) % 7;
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() - diff);
  const start = new Date(base);
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
};
