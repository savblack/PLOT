import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp, logoUrl } from '../App.jsx';
import { tmdb, setTmdbRegion } from '../api/tmdb.js';
import { supabase } from '../api/supabase.js';
import { edgeFunctionUrl } from '../api/functions.js';
import { useMediaSync } from '../hooks/useMediaSync.js';
import { useTraktSync } from '../hooks/useTraktSync.js';
import { usePremium } from '../hooks/usePremium.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { useShare } from '../hooks/useShare.js';
import { deleteAccountAndSignOut } from '../utils/deleteAccount.js';
import { fetchUserDataExport, downloadDataExport, downloadCsvExport } from '../utils/exportData.js';
import { buildFeedbackAttachmentPath } from '../utils/feedback.js';
import { downloadICS } from '../utils/ics.js';
import { getButtonLikeProps } from '../utils/interactive.js';
import { IANA_TIMEZONES } from '../utils/timezones.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../launchFeatures.js';
import SheetHeader from './SheetHeader.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import PlotLoader from './PlotLoader.jsx';
import Spinner from './Spinner.jsx';

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Integration row glyphs — stroke-based to match the other settings-row icons.
// Plex reads as a media "play"; Trakt as a "tracked/watched" check.
const PLEX_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);
const TRAKT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12.5l2.5 2.5L16 9" />
  </svg>
);

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
        <SheetHeader title="Region" onClose={onClose} />
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
            {saving ? <Spinner size="button" ariaHidden /> : 'Save Region'}
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

function PremiumBadge() {
  return (
    <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 999, padding: '0.15rem 0.5rem', marginLeft: '0.35rem', verticalAlign: 'middle' }}>
      Premium
    </span>
  );
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
            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Keeps your Watching list and custom lists intact</span>
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
        <SheetHeader title="Timezone" onClose={onClose} />

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
            {saving ? <Spinner size="button" ariaHidden /> : 'Save'}
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
    const next = chosen.includes(id) ? chosen.filter(i => i !== id) : [...chosen, id];
    setChosen(next);
    const providers = all
      .filter(p => next.includes(p.provider_id))
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
        {/* Sticky header — title + Save always visible */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
          <SheetHeader title={title} onClose={onClose} />
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
const AVATAR_VIEW = 288;   // crop viewport size (css px)
const AVATAR_OUT = 512;    // exported avatar size (px)

function clampNum(v, min, max) { return Math.min(max, Math.max(min, v)); }

/* Crop + zoom modal — pan by dragging, zoom with the slider, exported as a square JPEG. */
function AvatarCropModal({ src, saving, onCancel, onSave }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [nat, setNat] = useState(null); // natural { w, h }
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const baseScale = nat ? Math.max(AVATAR_VIEW / nat.w, AVATAR_VIEW / nat.h) : 1;
  const scale = baseScale * zoom;
  const dw = nat ? nat.w * scale : 0;
  const dh = nat ? nat.h * scale : 0;

  const clampOffset = (o, w, h) => ({
    x: clampNum(o.x, AVATAR_VIEW - w, 0),
    y: clampNum(o.y, AVATAR_VIEW - h, 0),
  });

  const onImgLoad = (e) => {
    const w = e.target.naturalWidth, h = e.target.naturalHeight;
    const bs = Math.max(AVATAR_VIEW / w, AVATAR_VIEW / h);
    const ndw = w * bs, ndh = h * bs;
    setNat({ w, h });
    setZoom(1);
    setOffset({ x: (AVATAR_VIEW - ndw) / 2, y: (AVATAR_VIEW - ndh) / 2 });
  };

  const handleZoom = (next) => {
    if (!nat) { setZoom(next); return; }
    const prev = baseScale * zoom;
    const ns = baseScale * next;
    const c = AVATAR_VIEW / 2;
    const ix = (c - offset.x) / prev;
    const iy = (c - offset.y) / prev;
    setOffset(clampOffset({ x: c - ix * ns, y: c - iy * ns }, nat.w * ns, nat.h * ns));
    setZoom(next);
  };

  const onPointerDown = (e) => {
    if (saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current || !nat) return;
    const nx = dragRef.current.ox + (e.clientX - dragRef.current.px);
    const ny = dragRef.current.oy + (e.clientY - dragRef.current.py);
    setOffset(clampOffset({ x: nx, y: ny }, dw, dh));
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  const handleSave = () => {
    if (!nat || saving || !imgRef.current) return;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sSize = AVATAR_VIEW / scale;
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_OUT;
    canvas.height = AVATAR_OUT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, AVATAR_OUT, AVATAR_OUT);
    canvas.toBlob((blob) => { if (blob) onSave(blob); }, 'image/jpeg', 0.9);
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={saving ? undefined : onCancel} />
      <div
        role="dialog"
        aria-label="Crop your photo"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(360px, calc(100vw - 2rem))', zIndex: 1001,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '1.1rem',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 500, marginBottom: '0.25rem' }}>
          Crop photo
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
          Drag to reposition, use the slider to zoom.
        </p>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'relative', width: AVATAR_VIEW, maxWidth: '100%', height: AVATAR_VIEW,
            margin: '0 auto', borderRadius: 'var(--radius-md)', overflow: 'hidden',
            background: '#000', cursor: saving ? 'default' : 'grab', touchAction: 'none', userSelect: 'none',
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            style={{ position: 'absolute', left: offset.x, top: offset.y, width: dw, height: dh, maxWidth: 'none', pointerEvents: 'none' }}
          />
          {/* Circular crop guide — dims everything outside the circle. */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
        </div>

        <input
          type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => handleZoom(parseFloat(e.target.value))}
          disabled={saving || !nat}
          aria-label="Zoom"
          style={{ width: '100%', marginTop: '0.9rem', accentColor: 'var(--accent)' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !nat}
            aria-busy={saving}
          >
            {saving ? <Spinner size="button" ariaHidden /> : 'Save photo'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function AvatarSetting({ user, profile, refreshProfile, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const avatarUrl = profile?.avatar_url || null;
  const initial = (profile?.display_name || profile?.username || user?.email || '?').trim().charAt(0).toUpperCase();

  const handlePick = () => { if (!busy) inputRef.current?.click(); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError(null);
    if (!file.type.startsWith('image/')) { onError('Please choose an image file.'); return; }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) { onError(`Profile photos must be under ${AVATAR_MAX_MB}MB.`); return; }
    setCropSrc(URL.createObjectURL(file));
  };

  const closeCrop = () => {
    setCropSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  const handleCropped = async (blob) => {
    setBusy(true);
    const path = `${user.id}/avatar.jpg`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) { setBusy(false); onError(upErr.message || 'We could not upload your photo. Please try again.'); return; }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so a replaced photo at the same path refreshes immediately.
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    setBusy(false);
    closeCrop();
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
      await supabase.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`));
    }
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    setBusy(false);
    if (error) { onError(error.message || 'We could not remove your photo. Please try again.'); return; }
    refreshProfile();
  };

  return (
    <>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <div className="settings-row-left">
          <div
            aria-hidden="true"
            style={{
              width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-dim)', color: 'var(--accent)',
              fontFamily: 'var(--font-serif)', fontSize: '0.85rem', fontWeight: 600,
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
              {busy ? 'Saving…' : avatarUrl ? 'Shown on your public profile' : `JPG or PNG · up to ${AVATAR_MAX_MB}MB`}
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
      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          saving={busy}
          onCancel={busy ? () => {} : closeCrop}
          onSave={handleCropped}
        />
      )}
    </>
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

function FeedbackPanel({ user, initialType, onClose }) {
  const [type,      setType]      = useState(initialType || 'bug');
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
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
          <SheetHeader
            title="Send feedback"
            onClose={onClose}
            action={status === 'done'
              ? undefined
              : {
                  label: status === 'submitting' ? 'Sending…' : 'Send',
                  onClick: handleSubmit,
                  disabled: !message.trim() || status === 'submitting',
                }}
          />
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
  const premium = usePremium(profile);
  const { events: calEvents, loading: calLoading } = useCalendar(
    watchlist?.items ?? [],
    watching?.items ?? [],
    watching?.fetchSeason,
    reminders?.reminders ?? [],
  );

  const [showProviders,       setShowProviders]       = useState(false);
  const [showGuideChannels,   setShowGuideChannels]   = useState(false);
  const [savingProviders,     setSavingProviders]     = useState(false);
  const [savingAvailabilityAlerts, setSavingAvailabilityAlerts] = useState(false);
  const [savingGuideChannels, setSavingGuideChannels] = useState(false);
  const [providerDraft,       setProviderDraft]       = useState(null);
  const [guideChannelDraft,   setGuideChannelDraft]   = useState(null);
  const [showRegion,          setShowRegion]          = useState(false);
  const [showTimezone,        setShowTimezone]        = useState(false);
  const [feedbackType,        setFeedbackType]        = useState(null);
  const [showClearWatchlist,  setShowClearWatchlist]  = useState(false);
  const [clearingHistory,     setClearingHistory]     = useState(false);
  const [clearingWatchlist,   setClearingWatchlist]   = useState(false);
  const [generatingCalToken,  setGeneratingCalToken]  = useState(false);
  const [exportingData,       setExportingData]       = useState(false);
  const [calTokenCopied,      setCalTokenCopied]      = useState(false);
  const [localCalToken,       setLocalCalToken]       = useState(null);
  const [usernameDraft,       setUsernameDraft]       = useState(null);
  const [usernameStatus,      setUsernameStatus]      = useState(null); // null|checking|available|taken|invalid|saving|saved|error
  const [emailDraft,          setEmailDraft]          = useState(null); // null = display, string = editing
  const [emailSaving,         setEmailSaving]         = useState(false);
  const [emailError,          setEmailError]          = useState(null); // inline error shown while editing
  const [emailNotice,         setEmailNotice]         = useState(null); // post-save confirmation note shown in display mode
  const [actionError,         setActionError]         = useState(null);
  const [confirmModal,        setConfirmModal]        = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  const [billingReturn,       setBillingReturn]       = useState(null); // null|'premium'|'tip'
  const [requestedIntegrations, setRequestedIntegrations] = useState(() => new Set());
  const [requestingIntegration, setRequestingIntegration] = useState(null);
  const premiumEventFired = useRef(false);

  const showConfirm = useCallback((opts) => setConfirmModal(opts), []);

  // Back from Stripe checkout: thank the user and re-pull the profile a few
  // times — the webhook that flips is_premium can lag the redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const tip = params.get('tip');
    if (!checkout && !tip) return;
    navigate('/settings', { replace: true });
    const returnState = checkout === 'success' ? 'premium' : tip === 'thanks' ? 'tip' : null;
    if (returnState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect the external checkout return URL in local UI state
      setBillingReturn(returnState);
    }
    if (checkout === 'success') {
      const timers = [1500, 4000, 9000].map(ms => setTimeout(() => refreshProfile(), ms));
      return () => timers.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount for the return-URL params
  }, []);

  useEffect(() => {
    if (billingReturn === 'premium' && profile?.is_premium && !premiumEventFired.current) {
      premiumEventFired.current = true;
      track(EVENTS.PREMIUM_ACTIVATED, {});
    }
  }, [billingReturn, profile?.is_premium]);

  // Use optimistic local value so the URL appears immediately after generation
  const calendarToken = localCalToken ?? profile?.calendar_token ?? null;
  const calFeedUrl = calendarToken ? edgeFunctionUrl('calendar-feed', { token: calendarToken }) : null;

  const { share: shareProfileLink, copied: profileUrlCopied } = useShare();
  const { share: shareInvite, copied: inviteCopied } = useShare();

  const username      = profile?.username || '';
  const isPublic      = !!profile?.is_public;
  const logRewatches  = profile?.log_rewatches ?? true;
  const usernameValue = usernameDraft ?? username;
  const usernameDirty = usernameValue.trim().toLowerCase() !== username.toLowerCase();
  const profileUrl    = username ? `${window.location.origin}/u/${username}` : null;
  // Invite link: the profile URL tagged with ?ref=<me>. attribution.js captures
  // ref on the new visitor; after they sign up, usePendingReferral auto-follows
  // me (and the follows trigger notifies me).
  const inviteUrl     = username ? `${profileUrl}?ref=${encodeURIComponent(username)}` : null;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear optimistic state once persisted profile data catches up
    setProviderDraft(null);
    setSavingProviders(false);
  }, [profile?.streaming_providers, providerDraft]);

  useEffect(() => {
    if (!guideChannelDraft) return;
    if (JSON.stringify(profile?.guide_channels ?? []) !== JSON.stringify(guideChannelDraft)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear optimistic state once persisted profile data catches up
    setGuideChannelDraft(null);
    setSavingGuideChannels(false);
  }, [profile?.guide_channels, guideChannelDraft]);

  // Load integrations on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { sync.loadIntegration(); }, [sync.loadIntegration]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { trakt.loadIntegration(); }, [trakt.loadIntegration]);

  const providers      = providerDraft ?? profile?.streaming_providers ?? [];
  const availabilityAlertsEnabled = !!profile?.watchlist_availability_alerts;
  const guideChannels  = guideChannelDraft ?? profile?.guide_channels ?? [];
  const region         = profile?.region || 'US';
  const timezone  = profile?.timezone || '';

  const saveProviders = async (newProviders) => {
    setActionError(null);
    setProviderDraft(newProviders);
    setSavingProviders(true);

    const { error } = await supabase
      .from('profiles')
      .update({ streaming_providers: newProviders })
      .eq('id', user.id);

    setSavingProviders(false);

    if (error) {
      setActionError(error.message || 'Failed to save your streaming platforms.');
      return false;
    }

    refreshProfile();
    return true;
  };

  const saveGuideChannels = async (newChannels) => {
    setActionError(null);
    setGuideChannelDraft(newChannels);
    setSavingGuideChannels(true);

    const { error } = await supabase
      .from('profiles')
      .update({ guide_channels: newChannels })
      .eq('id', user.id);

    setSavingGuideChannels(false);

    if (error) {
      setActionError(error.message || 'Failed to save your channels.');
      return false;
    }

    refreshProfile();
    return true;
  };

  const toggleAvailabilityAlerts = async () => {
    if (savingAvailabilityAlerts) return;
    if (!availabilityAlertsEnabled && providers.length === 0 && guideChannels.length === 0) {
      setActionError('Choose at least one streaming platform or channel before turning on availability alerts.');
      setShowProviders(true);
      return;
    }
    setActionError(null);
    setSavingAvailabilityAlerts(true);
    const { error } = await supabase.from('profiles')
      .update({ watchlist_availability_alerts: !availabilityAlertsEnabled })
      .eq('id', user.id);
    setSavingAvailabilityAlerts(false);
    if (error) {
      setActionError(error.message || 'Failed to update availability alerts.');
      return;
    }
    refreshProfile();
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
    const { data: myList, error: listLookupError } = await supabase.from('lists')
      .select('id').eq('user_id', user.id).eq('name', 'My List').maybeSingle();
    if (listLookupError) {
      setActionError(listLookupError.message || 'Failed to clear your watch list.');
      setClearingWatchlist(false);
      return;
    }
    const { error } = myList?.id
      ? await supabase.from('list_items').delete().eq('list_id', myList.id)
      : { error: null };
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
    const { data: myList, error: listLookupError } = await supabase.from('lists')
      .select('id').eq('user_id', user.id).eq('name', 'My List').maybeSingle();
    if (listLookupError) {
      setActionError(listLookupError.message || 'Failed to clear your watch list.');
      setClearingWatchlist(false);
      return;
    }
    const results = await Promise.all([
      myList?.id ? supabase.from('list_items').delete().eq('list_id', myList.id) : Promise.resolve({ error: null }),
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

  const handleExportData = async (format = 'json') => {
    if (exportingData) return;
    setActionError(null);
    setExportingData(format);
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
      if (format === 'csv') downloadCsvExport(result.payload);
      else downloadDataExport(result.payload);
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

  // Debounced username availability check while editing.
  useEffect(() => {
    if (usernameDraft === null) return;          // not editing
    if (!usernameDirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset validation state when editing returns to the saved username
      setUsernameStatus(null);
      return;
    }
    const candidate = usernameDraft.trim().toLowerCase();
    if (!USERNAME_RE.test(candidate)) { setUsernameStatus('invalid'); return; }
    let cancelled = false;
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { p_username: candidate });
      if (cancelled) return;
      setUsernameStatus(error ? 'error' : (data ? 'available' : 'taken'));
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [usernameDraft, usernameDirty]);

  const handleSaveUsername = async () => {
    const candidate = usernameValue.trim().toLowerCase();
    if (!usernameDirty) { setUsernameDraft(null); return; }
    if (!USERNAME_RE.test(candidate)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('saving');
    const { data: free, error: chkErr } = await supabase.rpc('username_available', { p_username: candidate });
    if (chkErr) { setUsernameStatus('error'); return; }
    if (!free) { setUsernameStatus('taken'); return; }
    const { error } = await supabase.from('profiles').update({ username: candidate }).eq('id', user.id);
    if (error) { setUsernameStatus(error.code === '23505' ? 'taken' : 'error'); return; }
    setUsernameDraft(null);
    setUsernameStatus('saved');
    setTimeout(() => setUsernameStatus(null), 2000);
    refreshProfile();
  };

  // ── Email change ──────────────────────────────────────────────────────────
  // Supabase requires the new address to be confirmed via a link before the
  // change takes effect, so the row shows a "check your inbox" note rather than
  // updating optimistically. Uniqueness (one email per account) is enforced by
  // Supabase Auth, which returns an error for an address already in use.
  const currentEmail = user?.email || '';
  const emailValue   = emailDraft ?? '';
  const emailDirty   = emailDraft !== null
    && emailValue.trim() !== ''
    && emailValue.trim().toLowerCase() !== currentEmail.toLowerCase();

  const startEditEmail  = () => { setEmailNotice(null); setEmailError(null); setEmailDraft(currentEmail); };
  const cancelEditEmail = () => { setEmailDraft(null); setEmailError(null); };

  const handleSaveEmail = async () => {
    const next = emailValue.trim();
    if (next.toLowerCase() === currentEmail.toLowerCase()) { cancelEditEmail(); return; }
    if (!EMAIL_RE.test(next)) { setEmailError('Enter a valid email address.'); return; }
    setEmailSaving(true);
    setEmailError(null);
    const { error } = await supabase.auth.updateUser({ email: next });
    setEmailSaving(false);
    if (error) {
      setEmailError(
        /already|registered|exists|in use/i.test(error.message || '')
          ? 'That email is already in use.'
          : (error.message || 'Could not update email. Try again.')
      );
      return;
    }
    setEmailDraft(null);
    setEmailNotice(`We sent a confirmation link to ${next}. Your email updates once you open it.`);
  };

  const handleTogglePublic = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ is_public: !isPublic }).eq('id', user.id);
    if (error) { setActionError(error.message); return; }
    refreshProfile();
  };

  const handleToggleLogRewatches = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ log_rewatches: !logRewatches }).eq('id', user.id);
    if (error) { setActionError(error.message); return; }
    refreshProfile();
  };

  // A little personality for profile shares — one picked at random (the card
  // already carries the avatar, stats and PLOT branding).
  const PROFILE_SHARE_LINES = [
    'This is where my evenings and weekends go.',
    'Everything I love to watch, in one place.',
    'A curated view of my screen time.',
    "Keep up with what I'm watching, on PLOT.",
  ];

  const handleShareProfile = () => {
    if (!profileUrl) return;
    // Native share sheet where available, clipboard fallback otherwise.
    return shareProfileLink({
      url: profileUrl,
      title: username ? `@${username} on PLOT` : 'My PLOT profile',
      text: PROFILE_SHARE_LINES[Math.floor(Math.random() * PROFILE_SHARE_LINES.length)],
      event: 'profile_shared',
    });
  };

  const handleInvite = () => {
    if (!inviteUrl) return;
    return shareInvite({
      url: inviteUrl,
      title: 'Join me on PLOT',
      text: "Join me on PLOT. Here's what I'm watching.",
      event: EVENTS.INVITE_SHARED,
    });
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
        <div className="settings-row" style={{ cursor: 'default', alignItems: emailDraft === null ? 'center' : 'flex-start' }}>
          <div className="settings-row-left" style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            {emailDraft === null ? (
              <div style={{ minWidth: 0 }}>
                <span className="settings-row-label" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentEmail}</span>
                {emailNotice && (
                  <div style={{ fontSize: '0.72rem', marginTop: '0.3rem', color: 'var(--accent)', lineHeight: 1.4 }}>{emailNotice}</div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="settings-row-label">Email</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
                  <input
                    type="email"
                    value={emailValue}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoComplete="email"
                    inputMode="email"
                    aria-label="Email address"
                    onChange={(e) => { setEmailDraft(e.target.value); if (emailError) setEmailError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && emailDirty && !emailSaving) handleSaveEmail();
                      if (e.key === 'Escape') cancelEditEmail();
                    }}
                    style={{
                      flex: 1, minWidth: 0, padding: '0.45rem 0.6rem',
                      borderRadius: 'var(--radius-sm, 8px)', border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.9rem',
                    }}
                  />
                </div>
                <div style={{
                  fontSize: '0.72rem', marginTop: '0.3rem', minHeight: '1rem',
                  color: emailError ? 'var(--danger)' : 'var(--text-muted)',
                }}>
                  {emailError || (emailSaving ? 'Saving…' : 'You’ll get a link to confirm the new address.')}
                </div>
              </div>
            )}
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            {emailDraft === null ? (
              <SettingsTextAction onClick={startEditEmail}>Edit</SettingsTextAction>
            ) : (
              <>
                <SettingsTextAction onClick={cancelEditEmail}>Cancel</SettingsTextAction>
                <SettingsTextAction onClick={handleSaveEmail} disabled={emailSaving || !emailDirty}>Save</SettingsTextAction>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Public profile */}
      <div className="settings-group">
        <div className="settings-group-title">Public profile</div>
        <AvatarSetting
          user={user}
          profile={profile}
          refreshProfile={refreshProfile}
          onError={setActionError}
        />

        {/* Visibility */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">{isPublic ? 'Profile is public' : 'Profile is private'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isPublic
                  ? 'Anyone with your link can see your watch count, recent watches and public lists.'
                  : 'Only you can see your activity. Make it public to share a profile link.'}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsTextAction onClick={handleTogglePublic} tone={isPublic ? 'danger' : 'default'}>
              {isPublic ? 'Make private' : 'Make public'}
            </SettingsTextAction>
          </div>
        </div>

        {/* Username */}
        <div className="settings-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
          <div className="settings-row-left" style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="settings-row-label">Username</div>
              {usernameDraft === null ? (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  {username}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
                    <input
                      type="text"
                      value={usernameValue}
                      spellCheck={false}
                      autoCapitalize="none"
                      maxLength={30}
                      autoFocus
                      aria-label="Username"
                      onChange={(e) => setUsernameDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      style={{
                        flex: 1, minWidth: 0, padding: '0.45rem 0.6rem',
                        borderRadius: 'var(--radius-sm, 8px)', border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.9rem',
                      }}
                    />
                  </div>
                  <div style={{
                    fontSize: '0.72rem', marginTop: '0.3rem', minHeight: '1rem',
                    color: usernameStatus === 'available' || usernameStatus === 'saved' ? 'var(--accent)'
                      : usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'error' ? 'var(--danger)'
                      : 'var(--text-muted)',
                  }}>
                    {usernameStatus === 'checking' && 'Checking availability…'}
                    {usernameStatus === 'available' && 'Available'}
                    {usernameStatus === 'taken' && 'That username is taken'}
                    {usernameStatus === 'invalid' && '3–30 chars · lowercase letters, numbers, hyphens'}
                    {usernameStatus === 'saving' && 'Saving…'}
                    {usernameStatus === 'saved' && 'Saved'}
                    {usernameStatus === 'error' && 'Something went wrong. Try again'}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0, alignSelf: 'center' }}>
            {usernameDraft === null ? (
              <SettingsTextAction onClick={() => setUsernameDraft(username)}>
                Edit
              </SettingsTextAction>
            ) : (
              <SettingsTextAction
                disabled={usernameStatus === 'checking' || usernameStatus === 'saving' || usernameStatus === 'invalid' || usernameStatus === 'taken'}
                onClick={handleSaveUsername}
              >
                Save
              </SettingsTextAction>
            )}
          </div>
        </div>

        {/* Shareable link — works for private profiles too (logged-in visitors
            can still request to follow). */}
        {profileUrl && (
          <div className="settings-row" style={{ cursor: 'default' }}>
            <div className="settings-row-left" style={{ minWidth: 0 }}>
              <div className="settings-row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="settings-row-label">Your profile link</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileUrl.replace(/^https?:\/\//, '')}
                </div>
              </div>
            </div>
            <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
              <SettingsTextAction onClick={handleShareProfile}>
                {profileUrlCopied ? 'Copied!' : 'Share'}
              </SettingsTextAction>
              <a className="settings-text-action" href={profileUrl} target="_blank" rel="noreferrer">
                <span>View</span><span aria-hidden="true">›</span>
              </a>
            </div>
          </div>
        )}

        {/* Invite friends — shares your profile tagged with ?ref so new signups
            attribute to you and follow you (notification fires). On a private
            profile the follow is a request you approve. */}
        {inviteUrl && (
          <div className="settings-row" style={{ cursor: 'default' }}>
            <div className="settings-row-left" style={{ minWidth: 0 }}>
              <div className="settings-row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="settings-row-label">Invite friends</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  They join from your profile &amp; {isPublic ? 'start following you' : 'request to follow you'}
                </div>
              </div>
            </div>
            <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
              <SettingsTextAction onClick={handleInvite}>
                {inviteCopied ? 'Copied!' : 'Invite'}
              </SettingsTextAction>
            </div>
          </div>
        )}
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

        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div>
              <div className="settings-row-label">Watchlist availability alerts</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>Email me when a saved title arrives on a streaming platform or channel I've selected, in {REGIONS.find(r => r.code === region)?.name ?? region}</div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsTextAction onClick={toggleAvailabilityAlerts} disabled={savingAvailabilityAlerts}>
              {savingAvailabilityAlerts ? 'Saving…' : availabilityAlertsEnabled ? 'Turn off' : 'Turn on'}
            </SettingsTextAction>
          </div>
        </div>

        {/* Rewatches */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">Log rewatches</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {logRewatches
                  ? 'Rewatching a title adds a new entry to your history.'
                  : 'Rewatching a title updates the existing entry instead of adding a new one.'}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsTextAction onClick={handleToggleLogRewatches}>
              {logRewatches ? 'Turn off' : 'Turn on'}
            </SettingsTextAction>
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

      {/* PLOT Premium — only shown to existing subscribers; checkout is offline for now */}
      {premium.isPremium && (
        <div className="settings-group">
          <div className="settings-group-title">PLOT Premium</div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <div className="settings-row-left">
              <div className="settings-row-icon" style={{ color: 'var(--accent)' }}>
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <div>
                <div className="settings-row-label">You have PLOT Premium</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Thank you for keeping PLOT running
                </div>
              </div>
            </div>
            <SettingsTextAction onClick={premium.openPortal} disabled={premium.busy}>
              {premium.busy ? 'Opening…' : 'Manage subscription'}
            </SettingsTextAction>
          </div>
          {billingReturn && (
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 8, margin: '0.25rem 1rem' }}>
              {billingReturn === 'tip' ? 'Thanks for supporting PLOT ♥' : 'PLOT Premium is active. Thank you ♥'}
            </div>
          )}
          {premium.error && (
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', borderRadius: 8, margin: '0.25rem 1rem' }}>
              {premium.error}
            </div>
          )}
        </div>
      )}

      {/* Plex */}
      <div className="settings-group">
        <div className="settings-group-title">Integrations</div>
        {SHOW_MEDIA_SYNC_INTEGRATIONS && !premium.isPremium ? (
          <>
            {[
              { name: 'Plex',  blurb: 'Sync your Plex watchlist and history', connected: sync.isConnected,  disconnect: sync.disconnect,  icon: PLEX_ICON },
              { name: 'Trakt', blurb: 'Sync Netflix, Prime, Disney+ & more',  connected: trakt.isConnected, disconnect: trakt.disconnect, icon: TRAKT_ICON },
            ].map(row => {
              const feature = `${row.name.toLowerCase()}_sync`;
              const requested = requestedIntegrations.has(feature);
              return (
                <div key={row.name} className="settings-row" style={{ cursor: 'default' }}>
                  <div className="settings-row-left">
                    <div className="settings-row-icon">{row.icon}</div>
                    <div>
                      <div className="settings-row-label">
                        {row.name}<PremiumBadge />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {row.connected ? 'Paused, needs PLOT Premium to sync' : row.blurb}
                      </div>
                    </div>
                  </div>
                  <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
                    <SettingsTextAction
                      disabled={requested || requestingIntegration === feature}
                      onClick={async () => {
                        track(EVENTS.PREMIUM_GATE_HIT, { feature });
                        setRequestingIntegration(feature);
                        const { error } = await supabase.from('feedback').insert({
                          user_id:    user?.id ?? null,
                          user_email: user?.email ?? null,
                          type:       'feature',
                          message:    `Requested access: ${row.name} sync`,
                        });
                        setRequestingIntegration(null);
                        if (!error) {
                          setRequestedIntegrations(prev => new Set(prev).add(feature));
                        }
                      }}
                    >
                      {requested ? 'Requested ✓' : requestingIntegration === feature ? 'Sending…' : 'Request access'}
                    </SettingsTextAction>
                    {row.connected && (
                      <SettingsTextAction onClick={row.disconnect} tone="danger">
                        Disconnect
                      </SettingsTextAction>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        ) : SHOW_MEDIA_SYNC_INTEGRATIONS ? (
          <>
            <div className="settings-row" style={{ cursor: 'default' }}>
              <div className="settings-row-left">
                <div className="settings-row-icon">{PLEX_ICON}</div>
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
                <div className="settings-row-icon">{TRAKT_ICON}</div>
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
              <div className="settings-row-label">
                Subscribe to Calendar{!premium.isPremium && <PremiumBadge />}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {!premium.isPremium
                  ? 'A live calendar feed needs PLOT Premium'
                  : (calendarToken ? 'Live feed · keep this link private' : 'Get a URL for Google or Apple Calendar')}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            {!premium.isPremium ? (
              <>
                <SettingsTextAction
                  disabled={requestedIntegrations.has('calendar_subscribe') || requestingIntegration === 'calendar_subscribe'}
                  onClick={async () => {
                    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'calendar_subscribe' });
                    setRequestingIntegration('calendar_subscribe');
                    const { error } = await supabase.from('feedback').insert({
                      user_id:    user?.id ?? null,
                      user_email: user?.email ?? null,
                      type:       'feature',
                      message:    'Requested access: Calendar subscribe',
                    });
                    setRequestingIntegration(null);
                    if (!error) {
                      setRequestedIntegrations(prev => new Set(prev).add('calendar_subscribe'));
                    }
                  }}
                >
                  {requestedIntegrations.has('calendar_subscribe')
                    ? 'Requested ✓'
                    : requestingIntegration === 'calendar_subscribe' ? 'Sending…' : 'Request access'}
                </SettingsTextAction>
                {calendarToken && (
                  <SettingsTextAction onClick={handleRevokeCalToken} tone="danger">
                    Revoke
                  </SettingsTextAction>
                )}
              </>
            ) : calendarToken ? (
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
                Watchlist, history, lists and more as JSON or CSV
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsTextAction
              disabled={!!exportingData}
              onClick={() => handleExportData('json')}
            >
              {exportingData === 'json' ? 'Preparing…' : 'Download .json'}
            </SettingsTextAction>
            <SettingsTextAction
              disabled={!!exportingData}
              onClick={() => handleExportData('csv')}
            >
              {exportingData === 'csv' ? 'Preparing…' : 'Download .csv'}
            </SettingsTextAction>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="settings-group">
        <div className="settings-group-title">Support</div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            </div>
            <div>
              <div className="settings-row-label">Support PLOT</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Help keep PLOT subscription-free
              </div>
            </div>
          </div>
          <a href="https://ko-fi.com/J7P123TYGK" target="_blank" rel="noreferrer">
            <img height="36" style={{ border: 0, height: 36 }} src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Buy Me a Coffee at ko-fi.com" />
          </a>
        </div>
        <div
          className="settings-row interactive-surface"
          onClick={() => setFeedbackType('bug')}
          {...getButtonLikeProps({ onPress: () => setFeedbackType('bug'), label: 'Report a bug' })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            </div>
            <span className="settings-row-label">Report a Bug</span>
          </div>
          <div className="settings-row-value">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14, opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
        <div
          className="settings-row interactive-surface"
          onClick={() => setFeedbackType('feature')}
          {...getButtonLikeProps({ onPress: () => setFeedbackType('feature'), label: 'Leave feedback' })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span className="settings-row-label">Leave Feedback</span>
          </div>
          <div className="settings-row-value">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14, opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
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

      <p style={{ margin: '1.75rem 0 0', padding: '0 0.25rem', fontSize: '0.74rem', lineHeight: 1.5, color: 'var(--text-muted)', textAlign: 'center' }}>
        Metadata and some artwork are provided by{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>

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
          hint="Select the free-to-air and broadcast channels to include in your Guide. For example, ABC iview, SBS On Demand, 9Now, 7Plus, 10 Play."
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
      {feedbackType && (
        <FeedbackPanel user={user} initialType={feedbackType} onClose={() => setFeedbackType(null)} />
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
