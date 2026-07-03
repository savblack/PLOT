import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp, logoUrl } from '../App.jsx';
import { tmdb, setTmdbRegion } from '../api/tmdb.js';
import { supabase } from '../api/supabase.js';
import { edgeFunctionUrl } from '../api/functions.js';
import { useMediaSync } from '../hooks/useMediaSync.js';
import { useTraktSync } from '../hooks/useTraktSync.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { deleteAccountAndSignOut } from '../utils/deleteAccount.js';
import { fetchUserDataExport, downloadDataExport } from '../utils/exportData.js';
import { buildFeedbackAttachmentPath } from '../utils/feedback.js';
import { downloadICS } from '../utils/ics.js';
import { getButtonLikeProps } from '../utils/interactive.js';
import { IANA_TIMEZONES } from '../utils/timezones.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../launchFeatures.js';
import ConfirmModal from './ConfirmModal.jsx';
import PlotLoader from './PlotLoader.jsx';

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
    if (saving || chosen === current) return;
    setSaving(true);
    const saved = await onSave(chosen).catch(() => false);
    if (!saved) setSaving(false);
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
            aria-busy={saving}
            aria-label={saving ? 'Saving region' : 'Save region'}
          >
            {saving ? <PlotLoader size="button" tone="dark" ariaHidden /> : 'Save Region'}
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

function SettingsTextAction({ children, onClick, disabled = false, tone = 'default' }) {
  return (
    <button
      type="button"
      className={`settings-text-action${tone === 'danger' ? ' settings-text-action--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{children}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
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
            aria-busy={saving}
            aria-label={saving ? 'Saving timezone' : 'Save timezone'}
          >
            {saving ? <PlotLoader size="button" tone="dark" ariaHidden /> : 'Save'}
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
          <div className="loading-state"><PlotLoader size="sm" /></div>
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
                  className={`provider-select-card interactive-surface${chosen.includes(p.provider_id) ? ' selected' : ''}`}
                  onClick={() => toggle(p.provider_id)}
                  {...getButtonLikeProps({
                    onPress: () => toggle(p.provider_id),
                    label: `${chosen.includes(p.provider_id) ? 'Deselect' : 'Select'} ${p.provider_name}`,
                    pressed: chosen.includes(p.provider_id),
                  })}
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

/* ── Profile photo ── */
const AVATAR_MAX_MB = 5;

function avatarStoragePath(userId, file) {
  const ext = file?.name?.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg';
  return `${userId}/avatar.${ext}`;
}

function AvatarSetting({ user, profile, refreshProfile, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const avatarUrl = profile?.avatar_url || null;
  const initial = (user?.email?.trim()?.[0] || '?').toUpperCase();

  const handlePick = () => { if (!busy) inputRef.current?.click(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError(null);
    if (!file.type.startsWith('image/')) { onError('Please choose an image file.'); return; }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) { onError(`Profile photos must be under ${AVATAR_MAX_MB}MB.`); return; }

    setBusy(true);
    const path = avatarStoragePath(user.id, file);
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setBusy(false); onError(upErr.message || 'We could not upload your photo. Please try again.'); return; }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so a replaced photo at the same path refreshes immediately.
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    setBusy(false);
    if (dbErr) { onError(dbErr.message || 'We could not save your photo. Please try again.'); return; }
    refreshProfile();
  };

  const handleRemove = async () => {
    if (busy || !avatarUrl) return;
    onError(null);
    setBusy(true);
    // Best-effort cleanup of any stored object for this user (extension may vary).
    const { data: files } = await supabase.storage.from('avatars').list(user.id);
    if (files?.length) {
      await supabase.storage.from('avatars').remove(files.map(f => `${user.id}/${f.name}`));
    }
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    setBusy(false);
    if (error) { onError(error.message || 'We could not remove your photo. Please try again.'); return; }
    refreshProfile();
  };

  return (
    <div className="settings-row" style={{ cursor: 'default' }}>
      <div className="settings-row-left">
        <div
          aria-hidden="true"
          style={{
            width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-dim)', color: 'var(--accent)',
            fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initial}
        </div>
        <div>
          <div className="settings-row-label">Profile Photo</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {busy ? 'Saving…' : avatarUrl ? 'Visible on your profile' : `JPG or PNG · up to ${AVATAR_MAX_MB}MB`}
          </div>
        </div>
      </div>
      <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
        <SettingsTextAction onClick={handlePick} disabled={busy}>
          {avatarUrl ? 'Change' : 'Add photo'}
        </SettingsTextAction>
        {avatarUrl && (
          <SettingsTextAction onClick={handleRemove} disabled={busy} tone="danger">
            Remove
          </SettingsTextAction>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}

/* ── Feedback panel ── */
const FEEDBACK_TYPES = [
  {
    id: 'bug',
    label: 'Bug report',
    icon: '✦',
    description: 'Something broke, behaved oddly, or felt unreliable.',
  },
  {
    id: 'feature',
    label: 'Feature request',
    icon: '✳',
    description: 'An idea that would make PLOT more useful or more delightful.',
  },
  {
    id: 'general',
    label: 'General feedback',
    icon: '✺',
    description: 'Anything else about the experience, product, or taste of the app.',
  },
];

const FEEDBACK_MAX = 4000;
const MAX_IMAGES   = 3;
const MAX_IMAGE_MB = 5;

function FeedbackPanel({ user, onClose }) {
  const [type,      setType]      = useState('bug');
  const [message,   setMessage]   = useState('');
  const [images,    setImages]    = useState([]); // [{ file, preview }]
  const [status,    setStatus]    = useState('idle'); // idle | submitting | done | error
  const [errorMessage, setErrorMessage] = useState('');
  const imagesRef = useRef([]);
  const selectedType = FEEDBACK_TYPES.find(entry => entry.id === type) || FEEDBACK_TYPES[0];
  const messageCount = message.length;

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

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    imagesRef.current.forEach(image => URL.revokeObjectURL(image.preview));
  }, []);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus('submitting');
    setErrorMessage('');

    // Upload first so we can keep the feedback row and attachment set in sync.
    const attachmentPaths = [];
    const attachmentUrls = [];
    for (const { file } of images) {
      const path = buildFeedbackAttachmentPath(file.name);
      const { error: upErr } = await supabase.storage
        .from('feedback-attachments')
        .upload(path, file, { contentType: file.type });

      if (upErr) {
        if (attachmentPaths.length > 0) {
          await supabase.storage.from('feedback-attachments').remove(attachmentPaths);
        }
        setStatus('error');
        setErrorMessage('We could not upload one of your screenshots. Remove it or try again.');
        return;
      }

      attachmentPaths.push(path);
      const { data } = supabase.storage.from('feedback-attachments').getPublicUrl(path);
      attachmentUrls.push(data.publicUrl);
    }

    const { error } = await supabase.from('feedback').insert({
      user_id:     user?.id ?? null,
      user_email:  user?.email ?? null,
      type,
      message:     message.trim().slice(0, FEEDBACK_MAX),
      attachments: attachmentUrls.length ? attachmentUrls : null,
    });

    if (error) {
      if (attachmentPaths.length > 0) {
        await supabase.storage.from('feedback-attachments').remove(attachmentPaths);
      }
      setStatus('error');
      setErrorMessage('Your feedback was not saved. Please try again.');
      return;
    }

    setStatus('done');
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div className="feedback-panel-header">
          <div>
            <div className="feedback-panel-kicker">PLOT Inbox</div>
            <h2 className="feedback-panel-title">Send feedback</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close" style={{ fontSize: '1rem', lineHeight: 1, border: 'none' }}>✕</button>
        </div>

        {status === 'done' ? (
          <div className="feedback-success">
            <div className="feedback-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="feedback-success-title">Feedback received</div>
            <div className="feedback-success-body">
              Thanks. This has been captured for the product backlog, and any attachments will stay linked to the report.
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="feedback-panel-body">
            <div className="feedback-panel-intro">
              <p>
                Found a bug, have a feature idea, or want to sharpen the product taste? Send it here.
              </p>
              <div className="feedback-privacy-pill">Mirrored anonymously into the PLOT feedback backlog</div>
            </div>

            <div className="feedback-type-grid">
              {FEEDBACK_TYPES.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => setType(entry.id)}
                  className={`feedback-type-card${type === entry.id ? ' is-active' : ''}`}
                >
                  <span className="feedback-type-icon" aria-hidden="true">{entry.icon}</span>
                  <span className="feedback-type-label">{entry.label}</span>
                  <span className="feedback-type-description">{entry.description}</span>
                </button>
              ))}
            </div>

            <div className="feedback-composer">
              <div className="feedback-composer-top">
                <div>
                  <div className="feedback-composer-label">{selectedType.label}</div>
                  <div className="feedback-composer-hint">
                    {type === 'bug'
                      ? 'Tell us what happened, where it happened, and how to reproduce it.'
                      : type === 'feature'
                        ? 'Describe the capability you want and the job it would help you do.'
                        : 'Share anything about the product, writing, pacing, or overall feel.'}
                  </div>
                </div>
                <div className="feedback-count">{messageCount} / {FEEDBACK_MAX}</div>
              </div>

              <textarea
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, FEEDBACK_MAX))}
                maxLength={FEEDBACK_MAX}
                className="feedback-textarea"
                placeholder={
                  type === 'bug'
                    ? 'Describe what happened and what you expected instead…'
                    : type === 'feature'
                      ? 'Describe the idea, the flow, and why it matters…'
                      : 'Share your thoughts on what feels strong, weak, missing, or unfinished…'
                }
                rows={7}
              />
            </div>

            <div className="feedback-attachments">
              {images.map((img, i) => (
                <div key={i} className="feedback-attachment">
                  <img src={img.preview} alt="" />
                  <button
                    onClick={() => removeImage(i)}
                    aria-label="Remove image"
                    className="feedback-attachment-remove"
                  >✕</button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label className="feedback-attach-btn" title="Attach image">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>Add screenshots</span>
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
            <div className="feedback-helper">
              Up to {MAX_IMAGES} images, {MAX_IMAGE_MB}MB each. Helpful for bugs, optional for everything else.
            </div>

            {status === 'error' && (
              <p className="feedback-error">
                {errorMessage || 'Something went wrong. Please try again.'}
              </p>
            )}

            <div className="feedback-actions">
              <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={status === 'submitting'}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSubmit}
                disabled={!message.trim() || status === 'submitting'}
              >
                {status === 'submitting' ? 'Sending…' : 'Send Feedback'}
              </button>
            </div>
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
  const [savingProviders,     setSavingProviders]     = useState(false);
  const [savingGuideChannels, setSavingGuideChannels] = useState(false);
  const [providerDraft,       setProviderDraft]       = useState(null);
  const [guideChannelDraft,   setGuideChannelDraft]   = useState(null);
  const [showRegion,          setShowRegion]          = useState(false);
  const [showTimezone,        setShowTimezone]        = useState(false);
  const [showFeedback,        setShowFeedback]        = useState(false);
  const [showClearWatchlist,  setShowClearWatchlist]  = useState(false);
  const [clearingHistory,     setClearingHistory]     = useState(false);
  const [clearingWatchlist,   setClearingWatchlist]   = useState(false);
  const [generatingCalToken,  setGeneratingCalToken]  = useState(false);
  const [exportingData,       setExportingData]       = useState(false);
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
    const shouldClearLocalToken = localCalToken && (
      profile?.calendar_token === localCalToken ||
      profile?.calendar_token === null
    );
    if (shouldClearLocalToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local optimistic token should clear once persisted state catches up
      setLocalCalToken(null);
    }
  }, [profile?.calendar_token, localCalToken]);

  useEffect(() => {
    if (!providerDraft) return;
    if (JSON.stringify(profile?.streaming_providers ?? []) !== JSON.stringify(providerDraft)) return;
    setProviderDraft(null);
    setSavingProviders(false);
  }, [profile?.streaming_providers, providerDraft]);

  useEffect(() => {
    if (!guideChannelDraft) return;
    if (JSON.stringify(profile?.guide_channels ?? []) !== JSON.stringify(guideChannelDraft)) return;
    setGuideChannelDraft(null);
    setSavingGuideChannels(false);
  }, [profile?.guide_channels, guideChannelDraft]);

  // Load integrations on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { sync.loadIntegration(); }, [sync.loadIntegration]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { trakt.loadIntegration(); }, [trakt.loadIntegration]);

  const providers      = providerDraft ?? profile?.streaming_providers ?? [];
  const guideChannels  = guideChannelDraft ?? profile?.guide_channels ?? [];
  const region         = profile?.region || 'US';
  const timezone  = profile?.timezone || '';

  const saveProviders = async (newProviders) => {
    setActionError(null);
    setProviderDraft(newProviders);
    setSavingProviders(true);
    setShowProviders(false);

    const { error } = await supabase
      .from('profiles')
      .update({ streaming_providers: newProviders })
      .eq('id', user.id);

    if (error) {
      setActionError(error.message || 'Failed to save your streaming platforms.');
      setShowProviders(true);
      setSavingProviders(false);
      return false;
    }

    refreshProfile();
    return true;
  };

  const saveGuideChannels = async (newChannels) => {
    setActionError(null);
    setGuideChannelDraft(newChannels);
    setSavingGuideChannels(true);
    setShowGuideChannels(false);

    const { error } = await supabase
      .from('profiles')
      .update({ guide_channels: newChannels })
      .eq('id', user.id);

    if (error) {
      setActionError(error.message || 'Failed to save your channels.');
      setShowGuideChannels(true);
      setSavingGuideChannels(false);
      return false;
    }

    refreshProfile();
    return true;
  };

  const saveRegion = async (code) => {
    setActionError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ region: code })
      .eq('id', user.id);

    if (error) {
      setActionError(error.message || 'Failed to save your region.');
      return false;
    }

    setTmdbRegion(code);
    refreshProfile();
    setShowRegion(false);
    return true;
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
      title: 'Sign out?',
      message: `You're signed in as ${user?.email}. You can sign back in anytime.`,
      confirmLabel: 'Sign out',
      onConfirm: () => {
        // The /logout page ends the session and confirms the user is signed
        // out, rather than bouncing straight out to the marketing site.
        navigate('/logout');
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
        const result = await deleteAccountAndSignOut({
          supabase,
          fetchImpl: fetch,
          deleteAccountUrl: edgeFunctionUrl('delete-account'),
          onDeleted: async () => {
            window.location.href = '/';
          },
        });

        if (!result.ok) {
          setActionError(result.error);
          return false;
        }

        return true;
      },
    });
  };

  const handleExportData = async () => {
    if (exportingData) return;
    setActionError(null);
    setExportingData(true);
    try {
      const result = await fetchUserDataExport({
        supabase,
        fetchImpl: fetch,
        exportUrl: edgeFunctionUrl('export-user-data'),
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      downloadDataExport(result.payload);
    } catch (err) {
      setActionError(err?.message || 'Failed to export your data.');
    } finally {
      setExportingData(false);
    }
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
            border: '1px solid var(--danger-border)',
            background: 'var(--danger-dim)',
            color: 'var(--danger)',
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
        <AvatarSetting
          user={user}
          profile={profile}
          refreshProfile={refreshProfile}
          onError={setActionError}
        />
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span className="settings-row-label">{user?.email}</span>
          </div>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={handleSignOut}
          {...getButtonLikeProps({ onPress: handleSignOut, label: 'Sign out' })}
        >
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

        <div
          className="settings-row interactive-surface"
          onClick={() => { if (!savingProviders) setShowProviders(true); }}
          {...getButtonLikeProps({ onPress: () => { if (!savingProviders) setShowProviders(true); }, label: 'Open streaming platforms', disabled: savingProviders })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <span className="settings-row-label">Streaming Platforms</span>
          </div>
          <div className="settings-row-value">
            <span>{savingProviders ? 'Saving…' : providers.length > 0 ? `${providers.length} selected` : 'None'}</span>
            <Chevron />
          </div>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={() => { if (!savingGuideChannels) setShowGuideChannels(true); }}
          {...getButtonLikeProps({ onPress: () => { if (!savingGuideChannels) setShowGuideChannels(true); }, label: 'Open my channels', disabled: savingGuideChannels })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </div>
            <span className="settings-row-label">My Channels</span>
          </div>
          <div className="settings-row-value">
            <span>{savingGuideChannels ? 'Saving…' : guideChannels.length > 0 ? `${guideChannels.length} selected` : 'None'}</span>
            <Chevron />
          </div>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={() => { setActionError(null); setShowRegion(true); }}
          {...getButtonLikeProps({ onPress: () => { setActionError(null); setShowRegion(true); }, label: 'Open region settings' })}
        >
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

        <div
          className="settings-row interactive-surface"
          onClick={() => setShowTimezone(true)}
          {...getButtonLikeProps({ onPress: () => setShowTimezone(true), label: 'Open timezone settings' })}
        >
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
          <div className="settings-theme-tabs" role="tablist" aria-label="Appearance options">
            {['light','dark','system'].map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={theme === t}
                className={`settings-theme-tab${theme === t ? ' is-active' : ''}`}
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
        {SHOW_MEDIA_SYNC_INTEGRATIONS ? (
          <>
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
              <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
                {sync.isConnected ? (
                  <>
                    <SettingsTextAction onClick={sync.sync} disabled={sync.syncing}>
                      {sync.syncing ? 'Syncing…' : 'Sync now'}
                    </SettingsTextAction>
                    <SettingsTextAction onClick={sync.disconnect} tone="danger">
                      Disconnect
                    </SettingsTextAction>
                  </>
                ) : (
                  <SettingsTextAction onClick={sync.startPlexAuth}>
                    Connect Plex
                  </SettingsTextAction>
                )}
              </div>
            </div>
            {sync.error && (
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', borderRadius: 8, margin: '0.25rem 1rem' }}>
                {sync.error}
              </div>
            )}

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
              <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
                {trakt.isConnected ? (
                  <>
                    <SettingsTextAction onClick={trakt.sync} disabled={trakt.syncing}>
                      {trakt.syncing ? 'Syncing…' : 'Sync now'}
                    </SettingsTextAction>
                    <SettingsTextAction onClick={trakt.disconnect} tone="danger">
                      Disconnect
                    </SettingsTextAction>
                  </>
                ) : (
                  <SettingsTextAction onClick={trakt.connect}>
                    Connect Trakt
                  </SettingsTextAction>
                )}
              </div>
            </div>
            {trakt.error && (
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', borderRadius: 8, margin: '0.25rem 1rem' }}>
                {trakt.error}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '0 1rem 0.75rem', fontSize: '0.78rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
            Direct Plex and Trakt account sync is being held for post-launch while the full production credential set and support runbook are completed.
          </div>
        )}

        {/* ── Import watch history ── */}
        <div
          className="settings-row interactive-surface"
          onClick={() => navigate('/import')}
          style={{ cursor: 'pointer' }}
          {...getButtonLikeProps({ onPress: () => navigate('/import'), label: 'Import watch history' })}
        >
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
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            {calendarToken ? (
              <>
                <SettingsTextAction onClick={handleCopyCalUrl}>
                  {calTokenCopied ? 'Copied!' : 'Copy link'}
                </SettingsTextAction>
                <SettingsTextAction onClick={handleRevokeCalToken} tone="danger">
                  Revoke
                </SettingsTextAction>
              </>
            ) : (
              <SettingsTextAction disabled={generatingCalToken} onClick={handleGenerateCalToken}>
                {generatingCalToken ? 'Generating…' : 'Generate link'}
              </SettingsTextAction>
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
          <SettingsTextAction
            disabled={calLoading || calEvents.length === 0}
            onClick={() => downloadICS(calEvents)}
          >
            Download .ics
          </SettingsTextAction>
        </div>

        {/* Export all data */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">Export Your Data</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Watchlist, history, lists and more as a JSON file
              </div>
            </div>
          </div>
          <SettingsTextAction
            disabled={exportingData}
            onClick={handleExportData}
          >
            {exportingData ? 'Preparing…' : 'Download .json'}
          </SettingsTextAction>
        </div>
      </div>

      {/* Support */}
      <div className="settings-group">
        <div className="settings-group-title">Support</div>
        <div
          className="settings-row interactive-surface"
          onClick={() => setShowFeedback(true)}
          {...getButtonLikeProps({ onPress: () => setShowFeedback(true), label: 'Report a bug or leave feedback' })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span className="settings-row-label">Report a Bug or Leave Feedback</span>
          </div>
          <div className="settings-row-value">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14, opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.76rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
          Metadata and some artwork are provided by{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </div>
      </div>

      {/* Danger zone */}
      <div className="settings-group">
        <div className="settings-group-title">Danger Zone</div>

        <div
          className="settings-row interactive-surface"
          onClick={clearingHistory ? undefined : handleClearHistory}
          style={{ cursor: clearingHistory ? 'default' : 'pointer' }}
          {...getButtonLikeProps({
            onPress: handleClearHistory,
            disabled: clearingHistory,
            label: 'Clear watch history',
          })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: clearingHistory ? 'var(--text-muted)' : undefined }}>
              {clearingHistory ? 'Clearing…' : 'Clear Watch History'}
            </span>
          </div>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={clearingWatchlist ? undefined : () => setShowClearWatchlist(true)}
          style={{ cursor: clearingWatchlist ? 'default' : 'pointer' }}
          {...getButtonLikeProps({
            onPress: () => setShowClearWatchlist(true),
            disabled: clearingWatchlist,
            label: 'Clear watch list',
          })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: clearingWatchlist ? 'var(--text-muted)' : undefined }}>
              {clearingWatchlist ? 'Clearing…' : 'Clear Watchlist'}
            </span>
          </div>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={handleDeleteAccount}
          style={{ color: 'var(--danger)' }}
          {...getButtonLikeProps({ onPress: handleDeleteAccount, label: 'Delete account' })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: 'var(--danger)' }}>Delete Account</span>
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
          onClose={() => {
            setShowProviders(false);
            if (!savingProviders) setProviderDraft(null);
          }}
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
          onClose={() => {
            setShowGuideChannels(false);
            if (!savingGuideChannels) setGuideChannelDraft(null);
          }}
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
