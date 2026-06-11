import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp, logoUrl } from '../App.jsx';
import { tmdb, setTmdbRegion } from '../api/tmdb.js';
import { supabase } from '../api/supabase.js';
import { edgeFunctionUrl } from '../api/functions.js';
import { useMediaSync } from '../hooks/useMediaSync.js';
import { useTraktSync } from '../hooks/useTraktSync.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { downloadICS } from '../utils/ics.js';
import { IANA_TIMEZONES } from '../utils/timezones.js';
import ConfirmModal from './ConfirmModal.jsx';

const REGIONS = [
  { code: 'US', name: 'United States' }, { code: 'AU', name: 'Australia' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'CA', name: 'Canada' },
  { code: 'NZ', name: 'New Zealand' },   { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },       { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },         { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },        { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },         { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },        { code: 'SG', name: 'Singapore' },
];

/* ── Region picker modal ── */
function RegionPicker({ current, onSave, onClose }) {
  const [chosen, setChosen] = useState(current || 'US');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(chosen);
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div style={{ padding: '1.25rem 1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 500 }}>Region</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </div>
        <div style={{ padding: '1rem', overflow: 'auto', flex: 1 }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
            Used to show content and streaming services available in your region.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {REGIONS.map(r => (
              <button
                key={r.code}
                style={{
                  padding: '0.7rem 0.9rem',
                  borderRadius: 'var(--radius-md)',
                  border: chosen === r.code ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                  background: chosen === r.code ? 'var(--accent-dim)' : 'var(--surface)',
                  color: chosen === r.code ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: chosen === r.code ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setChosen(r.code)}
              >
                {r.name}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={saving || chosen === current}
          >
            {saving ? 'Saving…' : 'Save Region'}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ── Chevron icon ── */
function Chevron() {
  return <svg viewBox="0 0 24 24" width="14" height="14" stroke="var(--text-muted)" fill="none" strokeWidth="2.5"><polyline points="9,18 15,12 9,6"/></svg>;
}

/* ── Clear Watchlist confirmation modal ── */
function ClearWatchlistModal({ onClearList, onClearBoth, onClose }) {
  return createPortal(
    <>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 0.5rem' }} />

        <div style={{ marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 500, marginBottom: '0.4rem' }}>
            Clear Watchlist
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Clear just your saved titles, or your watching list too?
          </div>
        </div>

        <button
          className="btn btn-ghost"
          style={{
            width: '100%', textAlign: 'left', justifyContent: 'flex-start',
            padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', gap: '0.75rem',
          }}
          onClick={onClearList}
        >
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem' }}>Clear Saved only</span>
            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Keeps your Watching list intact</span>
          </span>
        </button>

        <button
          className="btn btn-ghost"
          style={{
            width: '100%', textAlign: 'left', justifyContent: 'flex-start',
            padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)',
            border: '1px solid #EF444433', gap: '0.75rem',
            color: 'var(--chip-cinema)',
          }}
          onClick={onClearBoth}
        >
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem' }}>Clear Saved + Watching</span>
            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Removes everything from your watchlist</span>
          </span>
        </button>

        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </>,
    document.body
  );
}

/* ── Readable label from IANA tz string ── */
function fmtTz(tz) {
  if (!tz) return '';
  return tz.replace(/_/g, ' ').replace(/\//g, ' / ');
}

/* ── Timezone picker modal ── */
function TimezonePicker({ current, onSave, onClose }) {
  const [query,   setQuery]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [chosen,  setChosen]  = useState(current || '');

  // Use static list — Intl.supportedValuesOf('timeZone') is unsupported in Hermes (React Native)
  const allTzs = IANA_TIMEZONES;

  const deviceTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
  })();

  const filtered = query.trim()
    ? allTzs.filter(tz => tz.toLowerCase().includes(query.toLowerCase()))
    : allTzs;

  const handleSave = async () => {
    if (!chosen) return;
    setSaving(true);
    await onSave(chosen);
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div style={{ padding: '1.25rem 1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 500 }}>Timezone</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </div>

        <div style={{ padding: '0.75rem 1rem 0' }}>
          <input
            style={{
              width: '100%',
              padding: '0.6rem 1rem',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: '0.86rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            placeholder="Search timezones…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: '0.5rem 0', maxHeight: '55vh' }}>
          {/* Device timezone shortcut when not searching */}
          {!query && deviceTz && deviceTz !== chosen && (
            <button
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.7rem 1.1rem',
                background: 'var(--accent-dim)',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: '0.84rem',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
              onClick={() => setChosen(deviceTz)}
            >
              Use device timezone · {fmtTz(deviceTz)}
            </button>
          )}

          {filtered.map(tz => (
            <button
              key={tz}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.65rem 1.1rem',
                background: chosen === tz ? 'var(--accent-dim)' : 'none',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: '0.84rem',
                color: chosen === tz ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: chosen === tz ? 700 : 400,
              }}
              onClick={() => setChosen(tz)}
            >
              {fmtTz(tz)}
            </button>
          ))}
        </div>

        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={!chosen || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ── Provider / channel selector modal ── */
// channelsOnly: when true, fetches only free/ad-supported broadcast channels (not subscription streaming)
// limit: max providers shown when channelsOnly is false (30 for streaming, null = all)
function ProviderPicker({ title, hint, region, selected, onSave, onClose, limit = 30, channelsOnly = false }) {
  const [all,    setAll]    = useState([]);
  const [chosen, setChosen] = useState(selected.map(p => p.id));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (channelsOnly) {
      tmdb.getChannelProviders(region).then(results => {
        setAll(results);
        setLoading(false);
      });
    } else {
      tmdb.getWatchProvidersForRegion('tv', region).then(data => {
        const sorted = (data?.results || []).sort((a, b) => a.display_priority - b.display_priority);
        setAll(limit ? sorted.slice(0, limit) : sorted);
        setLoading(false);
      });
    }
  }, [region, limit, channelsOnly]);

  const toggle = (id) => {
    setChosen(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSave = () => {
    const providers = all
      .filter(p => chosen.includes(p.provider_id))
      .map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
    onSave(providers);
  };

  const visible = search.trim()
    ? all.filter(p => p.provider_name.toLowerCase().includes(search.trim().toLowerCase()))
    : all;

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        {/* Sticky header — title + Cancel + Save always visible */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          padding: '1.25rem 1.1rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 500 }}>{title}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
          </div>
        </div>

        {/* Scrollable content */}
        {loading ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : (
          <div style={{ padding: '1rem' }}>
            {hint && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>{hint}</p>
            )}
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
                background: 'var(--surface-raised)', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: '0.9rem', color: 'var(--text)',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <div className="providers-select-grid">
              {visible.map(p => (
                <div
                  key={p.provider_id}
                  className={`provider-select-card${chosen.includes(p.provider_id) ? ' selected' : ''}`}
                  onClick={() => toggle(p.provider_id)}
                >
                  <img src={logoUrl(p.logo_path, 'w92')} alt={p.provider_name} />
                  <span>{p.provider_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

/* ── Feedback panel ── */
const FEEDBACK_TYPES = [
  { id: 'bug',     label: 'Bug Report 🐛' },
  { id: 'feature', label: 'Feature Request 💡' },
  { id: 'general', label: 'General Feedback 💬' },
];

const FEEDBACK_MAX = 4000;
const MAX_IMAGES   = 3;
const MAX_IMAGE_MB = 5;

function FeedbackPanel({ user, onClose }) {
  const [type,      setType]      = useState('bug');
  const [message,   setMessage]   = useState('');
  const [images,    setImages]    = useState([]); // [{ file, preview }]
  const [status,    setStatus]    = useState('idle'); // idle | submitting | done | error

  const addImages = (files) => {
    const valid = [...files]
      .filter(f => f.type.startsWith('image/') && f.size <= MAX_IMAGE_MB * 1024 * 1024)
      .slice(0, MAX_IMAGES - images.length);
    setImages(prev => [
      ...prev,
      ...valid.map(f => ({ file: f, preview: URL.createObjectURL(f) })),
    ]);
  };

  const removeImage = (idx) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus('submitting');

    // Upload images to Storage
    const attachmentUrls = [];
    for (const { file } of images) {
      const ext  = file.name.split('.').pop();
      const path = `${user?.id ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('feedback-attachments')
        .upload(path, file, { contentType: file.type });
      if (!upErr) {
        const { data } = supabase.storage.from('feedback-attachments').getPublicUrl(path);
        attachmentUrls.push(data.publicUrl);
      }
    }

    const { error } = await supabase.from('feedback').insert({
      user_id:     user?.id ?? null,
      user_email:  user?.email ?? null,
      type,
      message:     message.trim().slice(0, FEEDBACK_MAX),
      attachments: attachmentUrls.length ? attachmentUrls : null,
    });
    setStatus(error ? 'error' : 'done');
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div style={{ padding: '1.25rem 1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 500 }}>Feedback</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close" style={{ fontSize: '1rem', lineHeight: 1, border: 'none' }}>✕</button>
        </div>

        {status === 'done' ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Thanks for your feedback!</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>We read every submission and use it to improve PLOT.</div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div style={{ padding: '1.25rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Found a bug or have an idea? We'd love to hear it.
            </p>

            {/* Type chips */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {FEEDBACK_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: 'var(--radius-pill)',
                    border: type === t.id ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                    background: type === t.id ? 'var(--accent-dim)' : 'var(--surface)',
                    color: type === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: type === t.id ? 700 : 500,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, 4000))}
              maxLength={4000}
              placeholder={
                type === 'bug'
                  ? 'Describe what happened and how to reproduce it…'
                  : type === 'feature'
                    ? 'What would you like to see in PLOT?'
                    : 'Share your thoughts…'
              }
              rows={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                lineHeight: 1.55,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />

            {/* Image attachments */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--border)', flexShrink: 0 }}>
                  <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => removeImage(i)}
                    aria-label="Remove image"
                    style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                  >✕</button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Attach image">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => { addImages(e.target.files); e.target.value = ''; }}
                  />
                </label>
              )}
            </div>

            {status === 'error' && (
              <p style={{ fontSize: '0.78rem', color: 'var(--chip-cinema)', margin: 0 }}>
                Something went wrong — please try again.
              </p>
            )}

            <button
              className="btn btn-primary btn-sm"
              onClick={handleSubmit}
              disabled={!message.trim() || status === 'submitting'}
              style={{ alignSelf: 'flex-end' }}
            >
              {status === 'submitting' ? 'Sending…' : 'Send Feedback'}
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

/* ═══════════════════════════════════════
   SettingsView
═══════════════════════════════════════ */
export default function SettingsView() {
  const { profile, user, theme, setTheme, refreshProfile, watchlist, watching, reminders } = useApp();
  const navigate = useNavigate();
  const sync  = useMediaSync(user?.id);
  const trakt = useTraktSync(user?.id);
  const { events: calEvents, loading: calLoading } = useCalendar(
    watchlist?.items ?? [],
    watching?.items ?? [],
    watching?.fetchSeason,
    reminders?.reminders ?? [],
  );

  const [showProviders,       setShowProviders]       = useState(false);
  const [showGuideChannels,   setShowGuideChannels]   = useState(false);
  const [showRegion,          setShowRegion]          = useState(false);
  const [showTimezone,        setShowTimezone]        = useState(false);
  const [showFeedback,        setShowFeedback]        = useState(false);
  const [showClearWatchlist,  setShowClearWatchlist]  = useState(false);
  const [clearingHistory,     setClearingHistory]     = useState(false);
  const [clearingWatchlist,   setClearingWatchlist]   = useState(false);
  const [generatingCalToken,  setGeneratingCalToken]  = useState(false);
  const [calTokenCopied,      setCalTokenCopied]      = useState(false);
  const [localCalToken,       setLocalCalToken]       = useState(null);
  const [actionError,         setActionError]         = useState(null);
  const [confirmModal,        setConfirmModal]        = useState(null); // { title, message, confirmLabel, danger, onConfirm }

  const showConfirm = useCallback((opts) => setConfirmModal(opts), []);

  // Use optimistic local value so the URL appears immediately after generation
  const calendarToken = localCalToken ?? profile?.calendar_token ?? null;
  const calFeedUrl = calendarToken ? edgeFunctionUrl('calendar-feed', { token: calendarToken }) : null;

  // Sync local token back to null once profile catches up (or if revoked elsewhere)
  useEffect(() => {
    if (localCalToken && profile?.calendar_token === localCalToken) setLocalCalToken(null);
    if (localCalToken && profile?.calendar_token === null) setLocalCalToken(null);
  }, [profile?.calendar_token, localCalToken]);

  // Load integrations on mount
  useEffect(() => { sync.loadIntegration(); }, [sync.loadIntegration]);
  useEffect(() => { trakt.loadIntegration(); }, [trakt.loadIntegration]);

  const providers      = profile?.streaming_providers || [];
  const guideChannels  = profile?.guide_channels || [];
  const region         = profile?.region || 'US';
  const timezone  = profile?.timezone || '';

  const saveProviders = async (newProviders) => {
    await supabase
      .from('profiles')
      .update({ streaming_providers: newProviders })
      .eq('id', user.id);
    refreshProfile();
    setShowProviders(false);
  };

  const saveGuideChannels = async (newChannels) => {
    await supabase
      .from('profiles')
      .update({ guide_channels: newChannels })
      .eq('id', user.id);
    refreshProfile();
    setShowGuideChannels(false);
  };

  const saveRegion = async (code) => {
    await supabase.from('profiles').update({ region: code }).eq('id', user.id);
    setTmdbRegion(code);
    refreshProfile();
    setShowRegion(false);
  };

  const saveTimezone = async (tz) => {
    await supabase
      .from('profiles')
      .update({ timezone: tz })
      .eq('id', user.id);
    refreshProfile();
    setShowTimezone(false);
    // Clear any pending nudge dismissal so the banner doesn't re-appear
    try { localStorage.removeItem('plot_tz_dismissed'); } catch { /* storage unavailable */ }
  };

  const handleSignOut = () => {
    showConfirm({
      message: 'Sign out of your account?',
      confirmLabel: 'Sign out',
      onConfirm: async () => {
        setActionError(null);
        const { error } = await supabase.auth.signOut();
        if (error) {
          setActionError(error.message || 'Failed to sign out.');
          return false;
        }
        window.location.href = '/';
        return true;
      },
    });
  };

  const handleClearHistory = () => {
    showConfirm({
      title: 'Clear watch history?',
      message: 'This will permanently delete all your watched entries. This cannot be undone.',
      confirmLabel: 'Clear history',
      danger: true,
      onConfirm: async () => {
        setActionError(null);
        setClearingHistory(true);
        const { error } = await supabase.from('journal').delete().eq('user_id', user.id);
        setClearingHistory(false);
        if (error) {
          setActionError(error.message || 'Failed to clear watch history.');
          return false;
        }
        return true;
      },
    });
  };

  const handleClearListOnly = async () => {
    setActionError(null);
    setShowClearWatchlist(false);
    setClearingWatchlist(true);
    const { error } = await supabase.from('list_items').delete().eq('user_id', user.id);
    if (error) {
      setActionError(error.message || 'Failed to clear your watch list.');
      setClearingWatchlist(false);
      return;
    }
    await watchlist.reload();
    setClearingWatchlist(false);
  };

  const handleClearListAndWatching = async () => {
    setActionError(null);
    setShowClearWatchlist(false);
    setClearingWatchlist(true);
    const results = await Promise.all([
      supabase.from('list_items').delete().eq('user_id', user.id),
      supabase.from('watching_progress').delete().eq('user_id', user.id),
    ]);
    const firstError = results.find(result => result.error)?.error;
    if (firstError) {
      setActionError(firstError.message || 'Failed to clear your watch list.');
      setClearingWatchlist(false);
      return;
    }
    await Promise.all([watchlist.reload(), watching.reload()]);
    setClearingWatchlist(false);
  };

  const handleDeleteAccount = () => {
    showConfirm({
      title: 'Delete account?',
      message: 'This will permanently delete your account and all your data. This cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
      onConfirm: async () => {
        setActionError(null);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setActionError('Your session has expired. Please sign in again before deleting your account.');
          return false;
        }
        const url = edgeFunctionUrl('delete-account');
        if (!url) {
          setActionError('Delete account is not configured in this environment.');
          return false;
        }
        const response = await fetch(url, {
          method:  'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          let message = 'Failed to delete your account.';
          try {
            const payload = await response.json();
            if (payload?.error) message = payload.error;
          } catch {
            const text = await response.text();
            if (text) message = text;
          }
          setActionError(message);
          return false;
        }
        const { error } = await supabase.auth.signOut();
        if (error) {
          setActionError(error.message || 'Your account was deleted, but sign out did not complete cleanly.');
          return false;
        }
        window.location.href = '/';
        return true;
      },
    });
  };

  const handleGenerateCalToken = async () => {
    setGeneratingCalToken(true);
    const token = crypto.randomUUID();
    const { error } = await supabase.from('profiles').update({ calendar_token: token }).eq('id', user.id);
    if (error) {
      console.error('[calendar] failed to save token:', error.message);
      setGeneratingCalToken(false);
      return;
    }
    setLocalCalToken(token);
    setGeneratingCalToken(false);
    refreshProfile();
  };

  const handleRevokeCalToken = () => {
    showConfirm({
      title: 'Revoke calendar link?',
      message: 'Your calendar app will stop receiving updates. You can generate a new link at any time.',
      confirmLabel: 'Revoke',
      danger: true,
      onConfirm: async () => {
        await supabase.from('profiles').update({ calendar_token: null }).eq('id', user.id);
        setLocalCalToken(null);
        refreshProfile();
      },
    });
  };

  const handleCopyCalUrl = async () => {
    if (!calFeedUrl) return;
    await navigator.clipboard.writeText(calFeedUrl);
    setCalTokenCopied(true);
    setTimeout(() => setCalTokenCopied(false), 2000);
  };

  return (
    <div style={{ paddingBottom: '2rem' }}>
      {actionError && (
        <div
          role="alert"
          style={{
            margin: '0.75rem 0 1rem',
            padding: '0.85rem 0.95rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(220, 38, 38, 0.18)',
            background: 'rgba(220, 38, 38, 0.08)',
            color: '#b91c1c',
            fontSize: '0.82rem',
            lineHeight: 1.5,
          }}
        >
          {actionError}
        </div>
      )}
      {/* Account */}
      <div className="settings-group" style={{ marginTop: '0.75rem' }}>
        <div className="settings-group-title">Account</div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span className="settings-row-label">{user?.email}</span>
          </div>
        </div>

        <div className="settings-row" onClick={handleSignOut}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </div>
            <span className="settings-row-label">Sign out</span>
          </div>
          <Chevron />
        </div>
      </div>

      {/* Viewing */}
      <div className="settings-group">
        <div className="settings-group-title">Viewing</div>

        <div className="settings-row" onClick={() => setShowProviders(true)}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <span className="settings-row-label">Streaming Platforms</span>
          </div>
          <div className="settings-row-value">
            <span>{providers.length > 0 ? `${providers.length} selected` : 'None'}</span>
            <Chevron />
          </div>
        </div>

        <div className="settings-row" onClick={() => setShowGuideChannels(true)}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </div>
            <span className="settings-row-label">My Channels</span>
          </div>
          <div className="settings-row-value">
            <span>{guideChannels.length > 0 ? `${guideChannels.length} selected` : 'None'}</span>
            <Chevron />
          </div>
        </div>

        <div className="settings-row" onClick={() => setShowRegion(true)}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <span className="settings-row-label">Region</span>
          </div>
          <div className="settings-row-value">
            <span>{REGIONS.find(r => r.code === region)?.name ?? region}</span>
            <Chevron />
          </div>
        </div>

        <div className="settings-row" onClick={() => setShowTimezone(true)}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
            </div>
            <span className="settings-row-label">Timezone</span>
          </div>
          <div className="settings-row-value">
            <span style={{ fontSize: '0.78rem', maxWidth: 160, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {timezone ? fmtTz(timezone) : 'Not set'}
            </span>
            <Chevron />
          </div>
        </div>

        {/* Theme */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </div>
            <span className="settings-row-label">Appearance</span>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['light','dark','system'].map(t => (
              <button
                key={t}
                className={`btn btn-xs ${theme === t ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTheme(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Plex */}
      <div className="settings-group">
        <div className="settings-group-title">Integrations</div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div>
              <div className="settings-row-label">Plex</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {sync.isConnected ? `Connected · Last synced ${
                  sync.integration?.last_sync_at
                    ? new Date(sync.integration.last_sync_at).toLocaleDateString()
                    : 'never'
                }` : 'Not connected'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {sync.isConnected ? (
              <>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={sync.sync}
                  disabled={sync.syncing}
                >
                  {sync.syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={sync.disconnect}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="btn btn-accent btn-xs"
                onClick={sync.startPlexAuth}
              >
                Connect Plex
              </button>
            )}
          </div>
        </div>
        {sync.error && (
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--chip-cinema)', background: '#EF444411', borderRadius: 8, margin: '0.25rem 1rem' }}>
            {sync.error}
          </div>
        )}

        {/* ── Trakt ── */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div>
              <div className="settings-row-label">Trakt</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {trakt.isConnected
                  ? `Connected · Last synced ${
                      trakt.integration?.last_sync_at
                        ? new Date(trakt.integration.last_sync_at).toLocaleDateString()
                        : 'never'
                    }`
                  : 'Connect to sync Netflix, Prime, Disney+ & more'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {trakt.isConnected ? (
              <>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={trakt.sync}
                  disabled={trakt.syncing}
                >
                  {trakt.syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={trakt.disconnect}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button className="btn btn-accent btn-xs" onClick={trakt.connect}>
                Connect Trakt
              </button>
            )}
          </div>
        </div>
        {trakt.error && (
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--chip-cinema)', background: '#EF444411', borderRadius: 8, margin: '0.25rem 1rem' }}>
            {trakt.error}
          </div>
        )}

        {/* ── Import watch history ── */}
        <div className="settings-row" onClick={() => navigate('/import')} style={{ cursor: 'pointer' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">Import Watch History</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Import from Netflix, Prime, Disney+, Max or Apple TV+
              </div>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>

      </div>

      {/* Calendar */}
      <div className="settings-group">
        <div className="settings-group-title">Calendar</div>

        {/* Subscribe */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">Subscribe to Calendar</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {calendarToken ? 'Live feed · keep this link private' : 'Get a URL for Google or Apple Calendar'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {calendarToken ? (
              <>
                <button className="btn btn-secondary btn-xs" onClick={handleCopyCalUrl}>
                  {calTokenCopied ? 'Copied!' : 'Copy link'}
                </button>
                <button className="btn btn-ghost btn-xs" onClick={handleRevokeCalToken}>
                  Revoke
                </button>
              </>
            ) : (
              <button
                className="btn btn-accent btn-xs"
                disabled={generatingCalToken}
                onClick={handleGenerateCalToken}
              >
                {generatingCalToken ? 'Generating…' : 'Generate link'}
              </button>
            )}
          </div>
        </div>

        {/* Export */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">Export to Calendar</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {calLoading ? 'Loading events…' : `${calEvents.length} event${calEvents.length !== 1 ? 's' : ''} · one-time snapshot`}
              </div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-xs"
            disabled={calLoading || calEvents.length === 0}
            onClick={() => downloadICS(calEvents)}
          >
            Download .ics
          </button>
        </div>
      </div>

      {/* Support */}
      <div className="settings-group">
        <div className="settings-group-title">Support</div>
        <div className="settings-row" onClick={() => setShowFeedback(true)}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span className="settings-row-label">Report a Bug OR Leave Feedback</span>
          </div>
          <div className="settings-row-value">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14, opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="settings-group">
        <div className="settings-group-title">Danger Zone</div>

        <div className="settings-row" onClick={clearingHistory ? undefined : handleClearHistory} style={{ cursor: clearingHistory ? 'default' : 'pointer' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: '#EF444433', color: 'var(--chip-cinema)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: clearingHistory ? 'var(--text-muted)' : undefined }}>
              {clearingHistory ? 'Clearing…' : 'Clear Watch History'}
            </span>
          </div>
        </div>

        <div className="settings-row" onClick={clearingWatchlist ? undefined : () => setShowClearWatchlist(true)} style={{ cursor: clearingWatchlist ? 'default' : 'pointer' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: '#EF444433', color: 'var(--chip-cinema)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: clearingWatchlist ? 'var(--text-muted)' : undefined }}>
              {clearingWatchlist ? 'Clearing…' : 'Clear Watchlist'}
            </span>
          </div>
        </div>

        <div className="settings-row" onClick={handleDeleteAccount} style={{ color: 'var(--chip-cinema)' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: '#EF444433', color: 'var(--chip-cinema)' }}>
              <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: 'var(--chip-cinema)' }}>Delete Account</span>
          </div>
        </div>
      </div>

      {/* Provider picker modal */}
      {showProviders && (
        <ProviderPicker
          title="My Platforms"
          region={region}
          selected={providers}
          onSave={saveProviders}
          onClose={() => setShowProviders(false)}
        />
      )}

      {showGuideChannels && (
        <ProviderPicker
          title="My Channels"
          hint="Select the free-to-air and broadcast channels to include in your Guide — e.g. ABC iview, SBS On Demand, 9Now, 7Plus, 10 Play."
          region={region}
          selected={guideChannels}
          channelsOnly
          onSave={saveGuideChannels}
          onClose={() => setShowGuideChannels(false)}
        />
      )}

      {/* Clear Watchlist modal */}
      {showClearWatchlist && (
        <ClearWatchlistModal
          onClearList={handleClearListOnly}
          onClearBoth={handleClearListAndWatching}
          onClose={() => setShowClearWatchlist(false)}
        />
      )}

      {/* Region picker modal */}
      {showRegion && (
        <RegionPicker
          current={region}
          onSave={saveRegion}
          onClose={() => setShowRegion(false)}
        />
      )}

      {/* Timezone picker modal */}
      {showTimezone && (
        <TimezonePicker
          current={timezone}
          onSave={saveTimezone}
          onClose={() => setShowTimezone(false)}
        />
      )}

      {/* Feedback panel */}
      {showFeedback && (
        <FeedbackPanel user={user} onClose={() => setShowFeedback(false)} />
      )}

      {confirmModal && (
        <ConfirmModal
          {...confirmModal}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
