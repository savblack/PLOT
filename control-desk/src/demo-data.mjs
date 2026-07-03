import { OPERATOR_CHANNELS } from '../shared/model.mjs';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const isoAtOffset = (anchorDate, dayOffset, hour) => {
  const date = new Date(anchorDate);
  date.setMinutes(0, 0, 0);
  date.setHours(hour, 0, 0, 0);
  date.setTime(date.getTime() + (dayOffset * DAY_MS));
  return date.toISOString();
};

const baseVariant = (platform, extra = {}) => ({
  platform,
  enabled: true,
  text_override: '',
  first_comment: '',
  status: 'draft',
  ...extra,
});

const variantSet = (overrides = {}) =>
  OPERATOR_CHANNELS.map((platform) => baseVariant(platform, overrides[platform] || {}));

const demoImage = (title, paletteA, paletteB) => (
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${paletteA}" />
          <stop offset="100%" stop-color="${paletteB}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" rx="56" fill="url(#g)" />
      <circle cx="980" cy="190" r="120" fill="rgba(255,255,255,0.18)" />
      <circle cx="240" cy="730" r="180" fill="rgba(255,255,255,0.12)" />
      <rect x="82" y="96" width="138" height="34" rx="17" fill="rgba(255,255,255,0.22)" />
      <text x="84" y="452" fill="white" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="92" font-weight="700">${title}</text>
      <text x="86" y="528" fill="rgba(255,255,255,0.84)" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="34">PLOT editorial preview</text>
    </svg>
  `)}`
);

export const enabledPlatformsForPost = (post) =>
  (post?.variants || []).filter((entry) => entry.enabled !== false);

export const previewTextForPlatform = (post, platform) => {
  const variant = (post?.variants || []).find((entry) => entry.platform === platform);
  if (variant?.text_override?.trim()) return variant.text_override.trim();

  const override = post?.content?.channel_overrides?.[platform];
  if (typeof override === 'string' && override.trim()) return override.trim();

  return (post?.content?.shared_text || '').trim();
};

export const previewFirstComment = (post, platform) => {
  const variant = (post?.variants || []).find((entry) => entry.platform === platform);
  return (variant?.first_comment || post?.content?.first_comment || '').trim();
};

export const createDemoPosts = (anchorDate = new Date()) => ([
  {
    id: 'demo-draft-1',
    source: 'generated',
    state: 'draft',
    legacy_post_type: 'guide',
    scheduled_for: isoAtOffset(anchorDate, 1, 10),
    topic_key: 'summer-watchlist-spotlight',
    content: {
      shared_text: 'Summer watchlist, sorted. Three picks for tonight if the group chat is frozen and nobody can decide.',
      channel_overrides: {
        x: 'Three watchlist picks for tonight, sorted by mood: tense, fun, and full chaos. Which one gets the remote?',
        instagram: 'Tonight\'s watchlist is sorted. Swipe from tense to fun to total chaos, then send this to the friend who never chooses.',
        threads: 'If the group chat is stalled again, here are three watchlist picks for tonight. Tense. Fun. Total chaos.',
      },
      hashtags: ['plot', 'watchlist', 'movies', 'tv'],
      alt_text: 'A clean editorial card listing three watchlist picks for tonight.',
      cta_variant: 'read_more',
      page_title: '3 Watchlist Picks for Tonight When Nobody Can Decide',
      page_body: [
        'Decision fatigue kills more movie nights than bad taste. This set keeps the opening choice simple: one tense pick, one crowd-pleaser, and one swing.',
        'The point is speed. Give the room three distinct moods, make the vote fast, and get the lights down before the momentum disappears.',
      ],
      sources: [
        { title: 'PLOT editorial desk', url: 'https://theplot.tv/whats-on' },
      ],
      first_comment: 'Save this for Friday night planning.',
    },
    variants: variantSet({
      instagram: { first_comment: 'Comment with the pick that wins the remote.' },
    }),
    media: [
      {
        sort_order: 0,
        portrait_path: demoImage('Watchlist Picks', '#515E87', '#C78387'),
        landscape_path: demoImage('Watchlist Picks', '#515E87', '#C78387'),
        channels: [...OPERATOR_CHANNELS],
      },
    ],
    tmdb_refs: [],
    payload: {},
    operator_post_notes: [
      { id: 'note-1', actor: 'Savannah', body: 'Needs final cover image once art direction lands.' },
    ],
    operator_approval_decisions: [],
  },
  {
    id: 'demo-review-1',
    source: 'manual',
    state: 'in_review',
    legacy_post_type: 'guide',
    scheduled_for: isoAtOffset(anchorDate, 0, 15),
    topic_key: 'operator-manual-announcement',
    content: {
      shared_text: 'We just tightened the PLOT publish workflow so operators can move from draft to schedule without hopping between tools.',
      channel_overrides: {
        x: 'PLOT publishing is now cleaner internally: draft, approve, schedule, publish, retry. One desk.',
        instagram: '',
        threads: 'The publishing stack is cleaner now. Drafts, approvals, scheduling, and retries are all in one internal desk.',
      },
      hashtags: ['plot', 'publishing', 'workflow'],
      alt_text: 'A workflow card showing approval and scheduling in one dashboard.',
      cta_variant: 'none',
      page_title: 'PLOT’s New Internal Publish Workflow',
      page_body: [
        'The goal was operational speed, not a prettier admin. Generated and manual posts now follow the same path.',
      ],
      sources: [
        { title: 'Control desk rollout notes', url: 'https://theplot.tv/whats-on' },
      ],
      first_comment: '',
    },
    variants: variantSet({
      instagram: { enabled: false },
      x: { status: 'draft' },
      threads: { status: 'draft' },
    }),
    media: [],
    tmdb_refs: [],
    payload: {},
    operator_post_notes: [
      { id: 'note-2', actor: 'Operator', body: 'Waiting on final wording for internal launch note.' },
    ],
    operator_approval_decisions: [],
  },
  {
    id: 'demo-scheduled-1',
    source: 'generated',
    state: 'scheduled',
    legacy_post_type: 'guide',
    scheduled_for: isoAtOffset(anchorDate, 2, 19),
    topic_key: 'weekend-streaming-roundup',
    content: {
      shared_text: 'Weekend streaming lineup: one sharp thriller, one comfort rewatch, and one series to start before everyone spoils it.',
      channel_overrides: {
        x: '',
        instagram: 'Weekend streaming lineup, handled. One sharp thriller, one comfort rewatch, one series to start before spoilers arrive.',
        threads: '',
      },
      hashtags: ['plot', 'weekend', 'streaming'],
      alt_text: 'A weekend guide card with three streaming recommendations.',
      cta_variant: 'read_more',
      page_title: 'What to Stream This Weekend',
      page_body: [
        'This package is built for Friday night planning. Keep the recommendation count low and the payoff obvious.',
      ],
      sources: [
        { title: 'Weekend streaming guide', url: 'https://theplot.tv/whats-on' },
      ],
      first_comment: 'Bookmark this before the weekend starts.',
    },
    variants: variantSet({
      x: { status: 'scheduled' },
      instagram: { status: 'scheduled', first_comment: 'Drop your own weekend pick below.' },
      threads: { status: 'scheduled' },
    }),
    media: [
      {
        sort_order: 0,
        portrait_path: demoImage('Weekend Guide', '#3F6C5F', '#E3B274'),
        landscape_path: demoImage('Weekend Guide', '#3F6C5F', '#E3B274'),
        channels: [...OPERATOR_CHANNELS],
      },
      {
        sort_order: 1,
        portrait_path: demoImage('Second Still', '#744B6E', '#D7B6D3'),
        landscape_path: demoImage('Second Still', '#744B6E', '#D7B6D3'),
        channels: ['instagram'],
      },
    ],
    tmdb_refs: [],
    payload: {},
    operator_post_notes: [],
    operator_approval_decisions: [
      { id: 'approval-1', actor: 'Savannah', decision: 'approved' },
    ],
  },
  {
    id: 'demo-failed-1',
    source: 'manual',
    state: 'failed',
    legacy_post_type: 'guide',
    scheduled_for: isoAtOffset(anchorDate, -1, 18),
    topic_key: 'festival-trailer-callout',
    content: {
      shared_text: 'Trailer of the day: the kind of cut that makes a festival title jump straight onto the watchlist.',
      channel_overrides: {
        x: 'Trailer of the day. Straight onto the watchlist.',
        instagram: '',
        threads: 'Trailer of the day. Straight onto the watchlist.',
      },
      hashtags: ['plot', 'trailer', 'watchlist'],
      alt_text: 'A trailer spotlight card with bold type.',
      cta_variant: 'none',
      page_title: 'Trailer of the Day',
      page_body: [
        'This one failed on publish after Instagram media validation. The copy should stay intact while operators retry only the failed channel.',
      ],
      sources: [
        { title: 'Festival desk note', url: 'https://theplot.tv/whats-on' },
      ],
      first_comment: '',
    },
    variants: variantSet({
      x: { status: 'published', published_at: isoAtOffset(anchorDate, -1, 18) },
      instagram: { status: 'failed', last_error: 'Media aspect ratio rejected by channel.' },
      threads: { status: 'published', published_at: isoAtOffset(anchorDate, -1, 18) },
    }),
    media: [
      {
        sort_order: 0,
        portrait_path: demoImage('Trailer Spotlight', '#312F43', '#CC6579'),
        landscape_path: demoImage('Trailer Spotlight', '#312F43', '#CC6579'),
        channels: [...OPERATOR_CHANNELS],
      },
    ],
    tmdb_refs: [],
    payload: {},
    operator_post_notes: [
      { id: 'note-3', actor: 'Operator', body: 'Retry after swapping crop for Instagram.' },
    ],
    operator_approval_decisions: [
      { id: 'approval-2', actor: 'Savannah', decision: 'approved' },
    ],
  },
]);
