import { useEffect, useMemo, useState } from 'react';

import { OPERATOR_CHANNELS, PLATFORM_LABELS, postSlug, weekRange } from '../shared/model.mjs';
import { createDemoPosts, enabledPlatformsForPost, previewFirstComment, previewTextForPlatform } from './demo-data.mjs';
import { firstMediaForPlatform, mediaSourceForItem } from './media.mjs';
import demoNewsletterHtml from '../../marketing/preview/out/newsletter.html?raw';

const STORAGE_KEY = 'plot-operator-token';
const DEMO_STORAGE_KEY = 'plot-operator-demo';
const DAY_MS = 86400000;
const SLOT_HOURS = Array.from({ length: 14 }, (_, index) => index + 8);

const PLATFORM_THEME = {
  x: { handle: '@theplottv', label: 'X', accent: 'theme-x' },
  instagram: { handle: '@theplottv', label: 'Instagram', accent: 'theme-instagram' },
  threads: { handle: '@theplottv', label: 'Threads', accent: 'theme-threads' },
};

const inferApiUrl = () => {
  if (import.meta.env.VITE_OPERATOR_API_URL) return import.meta.env.VITE_OPERATOR_API_URL;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  return supabaseUrl ? `${supabaseUrl}/functions/v1/operator-api` : '';
};

const apiUrl = inferApiUrl();
const hasDemoQuery = () => new URLSearchParams(window.location.search).get('demo') === '1';

const nextSlotIso = () => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.toISOString();
};

const toDateTimeInput = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const fromDateTimeInput = (value) => {
  if (!value) return '';
  return new Date(value).toISOString();
};

const emptyDraft = () => ({
  source: 'manual',
  state: 'draft',
  legacy_post_type: 'guide',
  scheduled_for: nextSlotIso(),
  topic_key: '',
  content: {
    shared_text: '',
    channel_overrides: { x: '', instagram: '', threads: '' },
    hashtags: [],
    alt_text: '',
    cta_variant: 'none',
    page_title: '',
    page_body: [],
    sources: [],
    first_comment: '',
  },
  variants: OPERATOR_CHANNELS.map((platform) => ({
    platform,
    enabled: true,
    text_override: '',
    first_comment: '',
    status: 'draft',
  })),
  media: [],
  tmdb_refs: [],
  payload: {},
  operator_post_notes: [],
  operator_approval_decisions: [],
});

const normalizePost = (post) => ({
  ...emptyDraft(),
  ...post,
  content: {
    ...emptyDraft().content,
    ...(post.content || {}),
    channel_overrides: {
      ...emptyDraft().content.channel_overrides,
      ...((post.content || {}).channel_overrides || {}),
    },
  },
  variants: OPERATOR_CHANNELS.map((platform) => {
    const existing = (post.operator_post_channel_variants || post.variants || []).find((entry) => entry.platform === platform);
    return existing
      ? { ...existing }
      : { platform, enabled: false, text_override: '', first_comment: '', status: 'draft' };
  }),
  media: [...(post.operator_post_media || post.media || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
  operator_post_notes: post.operator_post_notes || [],
  operator_approval_decisions: post.operator_approval_decisions || [],
});

const badgeTone = {
  draft: 'slate',
  in_review: 'amber',
  approved: 'teal',
  scheduled: 'sky',
  publishing: 'pink',
  published: 'teal',
  failed: 'rose',
  rejected: 'slate',
};

const request = async (token, path = '', options = {}) => {
  if (!apiUrl) throw new Error('Missing VITE_OPERATOR_API_URL or VITE_SUPABASE_URL');
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
};

const formatSchedule = (iso) => {
  if (!iso) return 'Unscheduled';
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const truncate = (text, length = 120) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > length ? `${clean.slice(0, length - 1).trim()}…` : clean;
};

const articleExcerpt = (post) => truncate((post.content.page_body || []).join(' '), 170);

const previewTitle = (post) => post.content.page_title || post.topic_key || 'Untitled post';

const postLead = (post) => truncate(post.content.shared_text || articleExcerpt(post) || 'No article summary written yet.', 130);

const serializeSources = (sources = []) =>
  sources
    .map((source) => [source.title, source.url].filter(Boolean).join(' | '))
    .join('\n');

const parseSources = (value) =>
  String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, url] = line.split('|').map((part) => part.trim());
      const href = url || title;
      return /^https?:\/\//i.test(href) ? { title: url ? title : '', url: href } : null;
    })
    .filter(Boolean);

const mediaDisplayName = (value, fallback = 'Uploaded image') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^data:image\//i.test(raw)) return fallback;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || fallback);
    }
  } catch { /* ignore */ }
  const parts = raw.split('/').filter(Boolean);
  return decodeURIComponent(parts.pop() || fallback);
};

const mediaLabel = (post) => {
  if (post.media[0]?.filename) return post.media[0].filename;
  if (post.media[0]?.portrait_path) return mediaDisplayName(post.media[0].portrait_path);
  if (post.media[0]?.landscape_path) return mediaDisplayName(post.media[0].landscape_path);
  return 'Artwork pending';
};

const countsForPosts = (posts) => ({
  articles: posts.length,
  drafts: posts.filter((post) => post.state === 'draft' || post.state === 'in_review' || post.state === 'rejected').length,
  approvals: posts.filter((post) => post.state === 'in_review').length,
  scheduled: posts.filter((post) => ['approved', 'scheduled', 'publishing'].includes(post.state)).length,
});

const makeDemoId = () => `demo-${Date.now()}`;
const issueDateLabel = (value) => (value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Draft preview');

const articleUrlForPost = (post) => {
  if (!post?.content?.page_title || !post?.scheduled_for) return null;
  return `https://theplot.tv/whats-on/${postSlug(post.content.page_title, post.scheduled_for)}`;
};

const articleHeroImage = (post) =>
  firstMediaForPlatform(post, 'x', 'landscape')
  || firstMediaForPlatform(post, 'threads', 'landscape')
  || firstMediaForPlatform(post, 'instagram', 'portrait');

const buildDemoNewsletterHtml = () =>
  demoNewsletterHtml
    .replace('width="600"', 'width="100%"')
    .replace('width:600px;max-width:600px', 'width:100%;max-width:600px');

const StateBadge = ({ state }) => (
  <span className={`state-badge tone-${badgeTone[state] || 'slate'}`}>{state.replace(/_/g, ' ')}</span>
);

const ChannelPills = ({ variants }) => (
  <div className="pill-row">
    {variants.filter((entry) => entry.enabled).map((entry) => (
      <span key={entry.platform} className="pill">
        {PLATFORM_LABELS[entry.platform]}
      </span>
    ))}
  </div>
);

const PostThumb = ({ post, compact = false }) => {
  const src = firstMediaForPlatform(post, 'instagram', 'portrait') || firstMediaForPlatform(post, 'x', 'landscape');

  return (
    <div className={`post-thumb ${compact ? 'compact' : ''}`}>
      {src ? (
        <img className="post-thumb-image" src={src} alt={post.content.alt_text || previewTitle(post)} />
      ) : (
        <>
          <div className="thumb-lines">
            <span />
            <span />
            <span />
          </div>
          <div className="thumb-poster">
            <strong>{mediaLabel(post)}</strong>
          </div>
        </>
      )}
    </div>
  );
};

const PostCard = ({ post, selected, onSelect, compact = false, showSchedule = true }) => (
  <button
    type="button"
    className={`post-card ${compact ? 'compact' : ''} ${selected ? 'selected' : ''}`}
    onClick={() => onSelect(post)}
  >
    <div className="post-card-copy">
      <div className="post-card-top">
        <StateBadge state={post.state} />
        <span className="meta">{post.source}</span>
      </div>
      <strong>{previewTitle(post)}</strong>
      <p>{postLead(post) || 'No copy written yet.'}</p>
      {showSchedule ? <span className="card-schedule">{formatSchedule(post.scheduled_for)}</span> : null}
    </div>
    <PostThumb post={post} compact={compact} />
  </button>
);

const LoginGate = ({ onSubmit, onDemo }) => {
  const [value, setValue] = useState('');
  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">PLOT internal</p>
        <h1>Publish desk</h1>
        <p>Use the operator token for the live workspace, or open a sample workspace to review the interface with realistic drafts and previews.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value.trim());
          }}
        >
          <label>
            Operator token
            <input value={value} onChange={(event) => setValue(event.target.value)} type="password" />
          </label>
          <div className="login-actions">
            <button type="submit">Open live workspace</button>
            <button type="button" className="ghost-button" onClick={onDemo}>Open sample workspace</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DraftList = ({ posts, selectedId, onSelect }) => (
  <div className="column-shell">
    <div className="column-head">
      <div>
        <p className="eyebrow">Articles</p>
        <h2>Editorial drafts</h2>
      </div>
      <span className="meta">{posts.length} items</span>
    </div>
    <div className="stack-list">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} selected={selectedId === post.id} onSelect={onSelect} />
      ))}
      {!posts.length && <div className="empty-panel">No drafts yet.</div>}
    </div>
  </div>
);

const QueueView = ({ posts, onSelect }) => {
  const groups = ['approved', 'scheduled', 'publishing', 'published', 'failed'];
  return (
    <div className="queue-grid">
      {groups.map((state) => {
        const groupPosts = posts.filter((post) => post.state === state);
        return (
          <section key={state} className="queue-column">
            <div className="queue-head">
              <h3>{state.replace(/_/g, ' ')}</h3>
              <span>{groupPosts.length}</span>
            </div>
            <div className="stack-list compact">
              {groupPosts.map((post) => (
                <PostCard key={post.id} post={post} onSelect={onSelect} compact showSchedule={false} />
              ))}
              {!groupPosts.length && <div className="empty-panel small">Nothing here.</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const CalendarView = ({ posts, onSelect, onDropPost, anchorDate, setAnchorDate }) => {
  const { start } = weekRange(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + (index * DAY_MS)));
  const dayMap = new Map(days.map((date) => [date.toISOString().slice(0, 10), []]));

  posts
    .filter((post) => post.scheduled_for)
    .forEach((post) => {
      const key = new Date(post.scheduled_for).toISOString().slice(0, 10);
      if (dayMap.has(key)) dayMap.get(key).push(post);
    });

  return (
    <div className="calendar-shell">
      <div className="calendar-head">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>Publishing calendar</h2>
        </div>
        <div className="calendar-actions">
          <button type="button" className="ghost-button" onClick={() => setAnchorDate(new Date(anchorDate.getTime() - (7 * DAY_MS)))}>Prev</button>
          <button type="button" className="ghost-button" onClick={() => setAnchorDate(new Date())}>Today</button>
          <button type="button" className="ghost-button" onClick={() => setAnchorDate(new Date(anchorDate.getTime() + (7 * DAY_MS)))}>Next</button>
        </div>
      </div>
      <div className="calendar-grid">
        <div className="calendar-time-column">
          <div className="calendar-time-header">Slots</div>
          {SLOT_HOURS.map((hour) => (
            <div key={hour} className="calendar-slot-label">{String(hour).padStart(2, '0')}:00</div>
          ))}
        </div>
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayPosts = dayMap.get(key) || [];
          return (
            <div key={key} className="calendar-day-column">
              <div className="calendar-day-header">
                <strong>{day.toLocaleDateString('en-AU', { weekday: 'short' })}</strong>
                <span>{day.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </div>
              {SLOT_HOURS.map((hour) => {
                const slotIso = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).toISOString();
                const slotPosts = dayPosts.filter((post) => new Date(post.scheduled_for).getHours() === hour);
                return (
                  <div
                    key={`${key}-${hour}`}
                    className="calendar-slot"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const postId = event.dataTransfer.getData('text/post-id');
                      if (postId) onDropPost(postId, slotIso);
                    }}
                  >
                    {slotPosts.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData('text/post-id', post.id)}
                        className={`calendar-post state-${post.state}`}
                        onClick={() => onSelect(post)}
                      >
                        <span>{previewTitle(post)}</span>
                        <small>{enabledPlatformsForPost(post).map((entry) => PLATFORM_LABELS[entry.platform]).join(' · ')}</small>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MediaList = ({ post, onReorder, onUpload }) => (
  <div className="media-panel">
    <div className="field-head">
      <span>Media</span>
      <label className="upload-button">
        Add media
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const files = [...(event.target.files || [])];
            if (files.length) onUpload(files);
            event.target.value = '';
          }}
        />
      </label>
    </div>
    <div className="media-list">
      {post.media.map((item, index) => (
        <div key={`${item.portrait_path || item.landscape_path || index}-${index}`} className="media-item">
          {mediaSourceForItem(item) ? (
            <img
              className="media-thumb"
              src={mediaSourceForItem(item)}
              alt={post.content.alt_text || mediaDisplayName(item.portrait_path || item.landscape_path, `Asset ${index + 1}`)}
            />
          ) : null}
          <div>
            <strong>{item.filename || mediaDisplayName(item.portrait_path || item.landscape_path, `Asset ${index + 1}`)}</strong>
            <p>Used for article and newsletter previews.</p>
          </div>
          <div className="media-controls">
            <button type="button" className="tiny-button" onClick={() => onReorder(index, -1)} disabled={index === 0}>Up</button>
            <button type="button" className="tiny-button" onClick={() => onReorder(index, 1)} disabled={index === post.media.length - 1}>Down</button>
          </div>
        </div>
      ))}
      {!post.media.length && <div className="empty-panel small">No media attached yet.</div>}
    </div>
  </div>
);

const PreviewCard = ({ post, platform }) => {
  const theme = PLATFORM_THEME[platform];
  const body = previewTextForPlatform(post, platform);
  const comment = previewFirstComment(post, platform);
  const previewImage = firstMediaForPlatform(post, platform, platform === 'x' || platform === 'threads' ? 'landscape' : 'portrait');

  return (
    <div className={`preview-card ${theme.accent}`}>
      <div className="preview-card-head">
        <div className="preview-avatar">{theme.label.slice(0, 1)}</div>
        <div>
          <strong>PLOT</strong>
          <span>{theme.handle}</span>
        </div>
        <span className="preview-platform-pill">{theme.label}</span>
      </div>
      <p className="preview-body">{body || 'Start writing to see the post preview.'}</p>
      <div className="preview-media">
        <div className="preview-media-top">
          <span />
          <span />
          <span />
        </div>
        <div className="preview-media-panel">
          <div className="preview-media-copy">
            <strong>{previewTitle(post)}</strong>
            <p>{articleExcerpt(post) || 'Article summary preview will appear here.'}</p>
          </div>
          {previewImage ? (
            <img className="preview-media-art-image" src={previewImage} alt={post.content.alt_text || previewTitle(post)} />
          ) : (
            <div className="preview-media-art">{mediaLabel(post)}</div>
          )}
        </div>
      </div>
      {comment ? <div className="preview-comment">First comment: {comment}</div> : null}
    </div>
  );
};

const ArticlePreviewCard = ({ post }) => {
  const heroImage = articleHeroImage(post);
  const articleUrl = articleUrlForPost(post);
  const body = (post.content.page_body || []).filter(Boolean);

  return (
    <article className="article-preview-card">
      {heroImage ? <img className="article-preview-hero" src={heroImage} alt={post.content.alt_text || previewTitle(post)} /> : null}
      <div className="article-preview-meta">
        <span>PLOT editorial draft</span>
        {post.scheduled_for ? <span>{formatSchedule(post.scheduled_for)}</span> : null}
      </div>
      <h3>{previewTitle(post)}</h3>
      {articleUrl ? <p className="article-preview-slug">{articleUrl.replace('https://theplot.tv', 'theplot.tv')}</p> : null}
      {body.length ? body.map((paragraph, index) => <p key={index} className="article-preview-body">{paragraph}</p>) : <p className="article-preview-body">Article body preview will appear here once paragraphs are written.</p>}
      {post.content.sources?.length ? (
        <div className="article-preview-sources">
          <strong>Sources</strong>
          <ul>
            {post.content.sources.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
};

const NewsletterView = ({ newsletter, loading, onRefresh, demoMode }) => (
  <div className="newsletter-shell">
    <div className="newsletter-head">
      <div>
        <p className="eyebrow">Newsletter</p>
        <h2>Weekly digest preview</h2>
        <p className="workspace-lead">Rendered email draft for the current weekly issue.</p>
      </div>
      <div className="newsletter-meta">
        {newsletter?.source ? <span className="flash neutral">{newsletter.source === 'saved_issue' ? 'Saved issue' : 'Live draft'}</span> : null}
        {newsletter?.issue_date ? <span className="meta">{issueDateLabel(newsletter.issue_date)}</span> : null}
        {!demoMode ? <button type="button" className="ghost-button" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh draft'}</button> : null}
      </div>
    </div>
    {newsletter?.subject ? <div className="newsletter-subject">{newsletter.subject}</div> : null}
    {newsletter?.html ? (
      <div className="newsletter-frame-shell">
        <iframe
          className="newsletter-frame"
          title="Newsletter preview"
          sandbox="allow-same-origin"
          srcDoc={newsletter.html}
        />
      </div>
    ) : (
      <div className="empty-panel">Newsletter preview is not available yet.</div>
    )}
  </div>
);

const Composer = ({
  post,
  onChange,
  onSave,
  onSubmitReview,
  onApprove,
  onSchedule,
  onPublishNow,
  onReject,
  onRetry,
  onAddNote,
  onUpload,
  onReorderMedia,
}) => {
  const [note, setNote] = useState('');

  if (!post) {
    return (
      <div className="composer-shell empty">
        <p className="eyebrow">Composer</p>
        <h2>Select a post</h2>
        <p>Choose an article draft to edit the website copy, artwork, and approval state.</p>
      </div>
    );
  }

  return (
    <div className="composer-shell">
      <div className="composer-head">
        <div>
          <p className="eyebrow">Post composer</p>
          <h2>{previewTitle(post)}</h2>
        </div>
        <StateBadge state={post.state} />
      </div>

      <div className="composer-layout">
        <div className="composer-editor">
          <div className="composer-grid">
            <label>
              Article title
              <input value={post.content.page_title} onChange={(event) => onChange('content.page_title', event.target.value)} />
            </label>
            <label>
              Scheduled time
              <input
                type="datetime-local"
                value={toDateTimeInput(post.scheduled_for)}
                onChange={(event) => onChange('scheduled_for', fromDateTimeInput(event.target.value))}
              />
            </label>
            <label className="full-width">
              Article summary
              <textarea rows="5" value={post.content.shared_text} onChange={(event) => onChange('content.shared_text', event.target.value)} />
            </label>
            <label>
              Alt text
              <textarea rows="3" value={post.content.alt_text} onChange={(event) => onChange('content.alt_text', event.target.value)} />
            </label>
            <label className="full-width">
              Article body
              <textarea
                rows="8"
                value={(post.content.page_body || []).join('\n\n')}
                onChange={(event) => onChange('content.page_body', event.target.value.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean))}
              />
            </label>
            <label className="full-width">
              Sources
              <textarea
                rows="5"
                value={serializeSources(post.content.sources)}
                onChange={(event) => onChange('content.sources', parseSources(event.target.value))}
                placeholder={'Title | https://example.com/source\nhttps://example.com/another-source'}
              />
            </label>
            <MediaList post={post} onUpload={onUpload} onReorder={onReorderMedia} />
          </div>

          <div className="action-row">
            <button type="button" onClick={onSave}>Save draft</button>
            <button type="button" className="ghost-button" onClick={onSubmitReview}>Send to review</button>
            <button type="button" className="ghost-button" onClick={onApprove}>Approve</button>
            <button type="button" className="ghost-button" onClick={onSchedule}>Schedule</button>
            <button type="button" className="ghost-button" onClick={onPublishNow}>Publish now</button>
            <button type="button" className="ghost-button danger" onClick={onReject}>Reject</button>
            <button type="button" className="ghost-button" onClick={onRetry}>Retry failed</button>
          </div>
        </div>

        <aside className="preview-pane">
          <div className="preview-pane-head">
            <div>
              <p className="eyebrow">Website article</p>
              <h3>Live preview</h3>
            </div>
          </div>
          <ArticlePreviewCard post={post} />
        </aside>
      </div>

      <div className="note-row">
        <textarea rows="3" placeholder="Add an internal note" value={note} onChange={(event) => setNote(event.target.value)} />
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            if (!note.trim()) return;
            onAddNote(note.trim());
            setNote('');
          }}
        >
          Add note
        </button>
      </div>

      <div className="history-grid">
        <section>
          <h3>Notes</h3>
          <div className="history-list">
            {post.operator_post_notes.map((entry) => (
              <div key={entry.id} className="history-item">
                <strong>{entry.actor || 'operator'}</strong>
                <p>{entry.body}</p>
              </div>
            ))}
            {!post.operator_post_notes.length && <div className="empty-panel small">No notes yet.</div>}
          </div>
        </section>
        <section>
          <h3>Approvals</h3>
          <div className="history-list">
            {post.operator_approval_decisions.map((entry) => (
              <div key={entry.id} className="history-item">
                <strong>{entry.decision}</strong>
                <p>{entry.actor || 'operator'}</p>
              </div>
            ))}
            {!post.operator_approval_decisions.length && <div className="empty-panel small">No approval history yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [demoMode, setDemoMode] = useState(() => hasDemoQuery() || localStorage.getItem(DEMO_STORAGE_KEY) === '1');
  const [view, setView] = useState('articles');
  const [posts, setPosts] = useState([]);
  const [, setChannels] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [newsletter, setNewsletter] = useState(null);

  const counts = useMemo(() => countsForPosts(posts), [posts]);

  const selectedPost = useMemo(() => {
    if (editing && !editing.id) return editing;
    const match = posts.find((post) => post.id === selectedId);
    return match ? normalizePost(match) : editing;
  }, [editing, posts, selectedId]);

  const syncSelection = (nextPosts, explicitId = selectedId) => {
    const target = explicitId ? nextPosts.find((post) => post.id === explicitId) : nextPosts[0];
    if (target) {
      setSelectedId(target.id || '');
      setEditing(normalizePost(target));
    } else {
      setSelectedId('');
      setEditing(null);
    }
  };

  const loadDemoWorkspace = () => {
    const seed = createDemoPosts(new Date()).map(normalizePost);
    setPosts(seed);
    setChannels(OPERATOR_CHANNELS.map((platform) => ({ platform })));
    syncSelection(seed, seed[0]?.id || '');
    setNewsletter({
      subject: 'This week in film & TV — PLOT',
      html: buildDemoNewsletterHtml(),
      issue_date: new Date().toISOString().slice(0, 10),
      source: 'demo_preview',
    });
  };

  const loadPosts = async (nextView = view) => {
    if (!token) return;
    setLoading(true);
    setStatus('');
    try {
      const params = new URLSearchParams();
      params.set('view', nextView);
      const payload = await request(token, `?${params.toString()}`, { method: 'GET' });
      const nextPosts = (payload.posts || []).map(normalizePost);
      setPosts(nextPosts);
      setChannels(payload.channels || []);
      syncSelection(nextPosts);
    } catch (error) {
      setStatus(error.message);
      if (/Unauthorized/i.test(error.message)) {
        localStorage.removeItem(STORAGE_KEY);
        setToken('');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadNewsletterPreview = async () => {
    if (demoMode) return;
    if (!token) return;
    setLoading(true);
    setStatus('');
    try {
      const payload = await request(token, '?view=newsletter', { method: 'GET' });
      setNewsletter(payload.newsletter || null);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (demoMode) {
      if (!posts.length) loadDemoWorkspace();
      return;
    }
    if (!token) return;
    if (view === 'newsletter') loadNewsletterPreview();
    else loadPosts(view);
  }, [demoMode, token, view]);

  const clearSession = () => {
    if (hasDemoQuery()) {
      window.location.href = `${window.location.origin}${window.location.pathname}`;
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setToken('');
    setDemoMode(false);
    setPosts([]);
    setChannels([]);
    setSelectedId('');
    setEditing(null);
    setStatus('');
  };

  const persistToken = (value) => {
    if (hasDemoQuery()) {
      window.location.href = `${window.location.origin}${window.location.pathname}`;
      return;
    }
    localStorage.removeItem(DEMO_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, value);
    setDemoMode(false);
    setToken(value);
  };

  const openDemoWorkspace = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(DEMO_STORAGE_KEY, '1');
    setToken('');
    setDemoMode(true);
    setView('articles');
    setStatus('Sample workspace loaded.');
    loadDemoWorkspace();
  };

  const changePost = (path, value) => {
    setEditing((current) => {
      const base = normalizePost(current || emptyDraft());
      if (path.startsWith('content.')) {
        const key = path.replace('content.', '');
        return { ...base, content: { ...base.content, [key]: value } };
      }
      if (path.startsWith('variant.')) {
        const [, platform, key] = path.split('.');
        return {
          ...base,
          variants: base.variants.map((entry) => (
            entry.platform === platform ? { ...entry, [key]: value } : entry
          )),
        };
      }
      return { ...base, [path]: value };
    });
  };

  const upsertLocalPost = (nextPost) => {
    const normalized = normalizePost(nextPost);
    setPosts((current) => {
      const exists = current.some((post) => post.id === normalized.id);
      return exists
        ? current.map((post) => (post.id === normalized.id ? normalized : post))
        : [normalized, ...current];
    });
    setSelectedId(normalized.id || '');
    setEditing(normalized);
    return normalized;
  };

  const sendDemoAction = async (action, extra = {}) => {
    const base = normalizePost(selectedPost || emptyDraft());
    const now = new Date().toISOString();
    let nextPost = { ...base, id: base.id || makeDemoId() };

    if (action === 'save_post') {
      nextPost = { ...nextPost, state: nextPost.state || 'draft' };
    }

    if (action === 'submit_review') {
      nextPost = { ...nextPost, state: 'in_review' };
    }

    if (action === 'approve_post') {
      nextPost = {
        ...nextPost,
        state: 'approved',
        operator_approval_decisions: [
          ...nextPost.operator_approval_decisions,
          { id: `approval-${Date.now()}`, actor: 'operator', decision: 'approved' },
        ],
      };
    }

    if (action === 'schedule_post') {
      nextPost = {
        ...nextPost,
        state: 'scheduled',
        scheduled_for: extra.scheduled_for || nextPost.scheduled_for || nextSlotIso(),
        variants: nextPost.variants.map((entry) => (entry.enabled ? { ...entry, status: 'scheduled' } : entry)),
      };
    }

    if (action === 'publish_now') {
      nextPost = {
        ...nextPost,
        state: 'published',
        variants: nextPost.variants.map((entry) => (
          entry.enabled ? { ...entry, status: 'published', published_at: now } : entry
        )),
      };
    }

    if (action === 'reject_post') {
      nextPost = {
        ...nextPost,
        state: 'rejected',
        operator_approval_decisions: [
          ...nextPost.operator_approval_decisions,
          { id: `approval-${Date.now()}`, actor: 'operator', decision: 'rejected' },
        ],
      };
    }

    if (action === 'retry_post') {
      nextPost = {
        ...nextPost,
        state: 'approved',
        variants: nextPost.variants.map((entry) => (
          entry.status === 'failed' ? { ...entry, status: 'draft', last_error: null } : entry
        )),
      };
    }

    if (action === 'add_note') {
      nextPost = {
        ...nextPost,
        operator_post_notes: [
          ...nextPost.operator_post_notes,
          { id: `note-${Date.now()}`, actor: 'operator', body: extra.body },
        ],
      };
    }

    const normalized = upsertLocalPost(nextPost);
    return { ok: true, post: normalized };
  };

  const sendAction = async (action, extra = {}, keepView = view) => {
    if (demoMode) return sendDemoAction(action, extra);

    const base = normalizePost(selectedPost || emptyDraft());
    const payload = {
      action,
      actor: 'operator',
      postId: base.id,
      post: {
        ...base,
        media: base.media,
        variants: base.variants,
      },
      ...extra,
    };
    const result = await request(token, '', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (result.post) {
      const normalized = normalizePost(result.post);
      setSelectedId(normalized.id || '');
      setEditing(normalized);
    }
    await loadPosts(keepView);
    return result;
  };

  const saveDraft = async () => {
    const result = await sendAction('save_post');
    setStatus(result.ok ? 'Draft saved.' : 'Draft save failed.');
  };

  const submitReview = async () => {
    const result = await sendAction('submit_review');
    setStatus(result.ok ? 'Sent to review.' : 'Review handoff failed.');
  };

  const approvePost = async () => {
    const result = await sendAction('approve_post', { scheduled_for: selectedPost?.scheduled_for }, 'articles');
    setStatus(result.ok ? 'Approved.' : 'Approval failed.');
    setView('articles');
  };

  const schedulePost = async () => {
    const result = await sendAction('schedule_post', { scheduled_for: selectedPost?.scheduled_for }, 'articles');
    setStatus(result.ok ? 'Scheduled.' : 'Scheduling failed.');
    setView('articles');
  };

  const publishNow = async () => {
    const result = await sendAction('publish_now', {}, 'articles');
    setStatus(result.ok ? 'Publish run started.' : 'Publish failed.');
    setView('articles');
  };

  const rejectPost = async () => {
    const result = await sendAction('reject_post');
    setStatus(result.ok ? 'Rejected.' : 'Reject failed.');
  };

  const retryPost = async () => {
    const result = await sendAction('retry_post', {}, 'articles');
    setStatus(result.ok ? 'Failed variants reset for retry.' : 'Retry failed.');
    setView('articles');
  };

  const addNote = async (body) => {
    const result = await sendAction('add_note', { body });
    setStatus(result.ok ? 'Note added.' : 'Note failed.');
  };

  const createManual = () => {
    setView('articles');
    setSelectedId('');
    setEditing(emptyDraft());
  };

  const reorderMedia = (index, delta) => {
    setEditing((current) => {
      const base = normalizePost(current || emptyDraft());
      const next = [...base.media];
      const target = index + delta;
      if (target < 0 || target >= next.length) return base;
      [next[index], next[target]] = [next[target], next[index]];
      return {
        ...base,
        media: next.map((entry, position) => ({ ...entry, sort_order: position })),
      };
    });
  };

  const uploadMedia = async (files) => {
    if (demoMode) {
      const base = normalizePost(selectedPost || emptyDraft());
      const demoMedia = await Promise.all(files.map(async (file, index) => ({
        sort_order: base.media.length + index,
        portrait_path: await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
        landscape_path: null,
        channels: [...OPERATOR_CHANNELS],
        filename: file.name,
      })));
      upsertLocalPost({
        ...base,
        id: base.id || makeDemoId(),
        media: [...base.media, ...demoMedia],
      });
      setStatus('Demo media attached.');
      return;
    }

    let currentPost = selectedPost;
    if (!currentPost?.id) {
      const saved = await sendAction('save_post');
      currentPost = normalizePost(saved.post);
    }

    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await request(token, '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upload_media',
          postId: currentPost.id,
          filename: file.name,
          dataUrl,
        }),
      });
      currentPost = normalizePost(result.post);
      setEditing(currentPost);
    }
    await loadPosts(view);
    setStatus('Media uploaded.');
  };

  if (!token && !demoMode) return <LoginGate onSubmit={persistToken} onDemo={openDemoWorkspace} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">PLOT editorial</p>
          <h1>Control desk</h1>
          <p>Review website articles and the weekly newsletter in one internal desk.</p>
        </div>

        <nav className="tab-list">
          <button type="button" className={view === 'articles' ? 'active' : ''} onClick={() => setView('articles')}>
            <span className="tab-label">Articles</span>
            <span className="tab-meta">{counts.articles} editorial drafts</span>
          </button>
          <button type="button" className={view === 'newsletter' ? 'active' : ''} onClick={() => setView('newsletter')}>
            <span className="tab-label">Newsletter</span>
            <span className="tab-meta">Weekly digest draft</span>
          </button>
        </nav>

        <div className="status-card">
          <p className="eyebrow">{demoMode ? 'Sample workspace' : 'Editorial status'}</p>
          <strong>{counts.drafts} articles need attention</strong>
          <p className="status-copy">{counts.approvals} in review · {counts.scheduled} scheduled or approved</p>
        </div>

        <button type="button" className="logout-button" onClick={clearSession}>
          {demoMode ? 'Exit sample workspace' : 'Sign out'}
        </button>
      </aside>

      <main className="workspace">
        <header className="workspace-head">
          <div className="channel-banner">
            <div className="channel-banner-icon">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="eyebrow">Website + newsletter</p>
              <h2>PLOT editorial</h2>
              <p className="workspace-lead">
                {view === 'newsletter'
                  ? 'Review the current weekly digest draft without leaving the operator desk.'
                  : 'Write, review, schedule, and preview website articles before they flow into the newsletter.'}
              </p>
            </div>
          </div>

          <div className="workspace-actions">
            {view !== 'newsletter' ? (
              <button type="button" className="primary-action" onClick={createManual}>New article</button>
            ) : (
              !demoMode ? <button type="button" className="ghost-button" onClick={loadNewsletterPreview} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh draft'}</button> : null
            )}
          </div>
        </header>

        <div className="workspace-meta">
          {loading ? <span className="meta">Refreshing…</span> : null}
          {status ? <span className="flash">{status}</span> : null}
        </div>

        <div className="workspace-grid">
          {view === 'newsletter' ? (
            <div className="column-shell newsletter-wide">
              <NewsletterView newsletter={newsletter} loading={loading} onRefresh={loadNewsletterPreview} demoMode={demoMode} />
            </div>
          ) : null}
          {view === 'articles' ? (
            <DraftList posts={posts} selectedId={selectedId} onSelect={(post) => { setSelectedId(post.id); setEditing(post); }} />
          ) : null}

          {view !== 'newsletter' ? (
            <Composer
              post={selectedPost}
              onChange={changePost}
              onSave={saveDraft}
              onSubmitReview={submitReview}
              onApprove={approvePost}
              onSchedule={schedulePost}
              onPublishNow={publishNow}
              onReject={rejectPost}
              onRetry={retryPost}
              onAddNote={addNote}
              onUpload={uploadMedia}
              onReorderMedia={reorderMedia}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
