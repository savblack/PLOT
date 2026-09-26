import TrackingSettings from './TrackingSettings.jsx';
import BroadcastAccountSettings from './BroadcastAccountSettings.jsx';
// Web settings use DOM panels, browser sharing and Stripe portal redirects.
// Shared navigation/copy lives in core; native layout parity: GitHub issue 922.
import { SHARING } from '@plot/core/copy/sharing.js';
import { buildProfileShareUrl } from '@plot/core/sharing.js';
import { USERNAME_RE } from '@plot/core/profileFields.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { logoUrl } from '../utils/images.js';
import { tmdb, setTmdbRegion } from '@plot/core/tmdb.js';
import { supabase } from '@plot/core/supabase.js';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { useMediaSync } from '../hooks/useMediaSync.js';
import { useTraktSync } from '../hooks/useTraktSync.js';
import { useSimklSync } from '../hooks/useSimklSync.js';
import { usePremium } from '../hooks/usePremium.js';
import { useGenres } from '../hooks/useGenres.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { useShare } from '../hooks/useShare.js';
import { deleteAccountAndSignOut } from '../utils/deleteAccount.js';
import { clearWatchHistory } from '@plot/core/userMedia.js';
import { updateProfile } from '@plot/core/profile.js';
import {
  AVATAR_MAX_MB, validateAvatarFile, isDuplicateUsernameError,
} from '@plot/core/profileFields.js';
import { fetchUserDataExport, downloadDataExport, downloadCsvExport } from '../utils/exportData.js';
import { buildFeedbackAttachmentPath } from '../utils/feedback.js';
import { downloadICS } from '../utils/ics.js';
import { setUserTimezone } from '../utils/date.js';
import { getButtonLikeProps } from '../utils/interactive.js';
import { getAuthCallbackUrl } from '../utils/redirects.js';
import { COMMON } from '../copy/common.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { PROFILE_PRIVACY } from '../copy/profilePrivacy.js';
import { favoriteWords } from '../utils/spelling.js';
import { MODERATION } from '../copy/moderation.js';
import { useBlocks } from '@plot/core/useBlocks.js';
import { IANA_TIMEZONES } from '../utils/timezones.js';
import { REGIONS, DEFAULT_REGION, regionName } from '@plot/core/regions.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../launchFeatures.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { SETTINGS_SECTIONS, settingsSelectionSummary } from '@plot/core/settings.js';
import SettingsPage, { SettingsPreferenceRow, SettingsSwitch, SettingsTextAction } from './SettingsPage.jsx';
import SettingsBilling from './SettingsBilling.jsx';
import SheetHeader from './SheetHeader.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import Spinner from './Spinner.jsx';

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
const SIMKL_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7h11" />
    <path d="M13 4l3 3-3 3" />
    <path d="M19 17H8" />
    <path d="M11 14l-3 3 3 3" />
  </svg>
);

/* ── Region picker modal ── */
function RegionPicker({ current, onSave, onClose }) {
  const [chosen, setChosen] = useState(current || DEFAULT_REGION);
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
            aria-label={saving ? SETTINGS_VIEW.region.savingRegion : SETTINGS_VIEW.region.saveRegion}
          >
            {saving ? <Spinner size="button" ariaHidden /> : SETTINGS_VIEW.region.saveRegionLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

function PremiumBadge() {
  return (
    <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 999, padding: '0.15rem 0.5rem', marginLeft: '0.35rem', verticalAlign: 'middle' }}>
      Premium
    </span>
  );
}

/* ── Checkbox row used by ClearListsModal ── */
function ClearListRow({ checked, onToggle, label, sublabel, danger = false }) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onToggle}
      aria-pressed={checked}
      style={{
        width: '100%', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'center',
        padding: '0.75rem 0.9rem', borderRadius: 'var(--radius-md)',
        border: checked ? `1.5px solid ${danger ? 'var(--danger)' : 'var(--accent)'}` : '1.5px solid var(--border)',
        background: checked ? (danger ? 'var(--danger-dim)' : 'var(--accent-dim)') : 'transparent',
        gap: '0.75rem', transition: 'all 0.12s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0, width: 18, height: 18, borderRadius: 5,
          border: `1.5px solid ${checked ? (danger ? 'var(--danger)' : 'var(--accent)') : 'var(--border)'}`,
          background: checked ? (danger ? 'var(--danger)' : 'var(--accent)') : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked && (
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: danger && checked ? 'var(--danger)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {sublabel && <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{sublabel}</span>}
      </span>
    </button>
  );
}

/* ── Clear/delete lists modal — one place to clear Saved, Watching, or any custom list ── */
function ClearWatchlistModal({ savedCount, watchingCount, customLists = [], onClear, onClose }) {
  const [selected, setSelected] = useState({ saved: false, watching: false, custom: new Set() });

  const toggleSaved    = () => setSelected(s => ({ ...s, saved: !s.saved }));
  const toggleWatching = () => setSelected(s => ({ ...s, watching: !s.watching }));
  const toggleCustom   = (id) => setSelected(s => {
    const next = new Set(s.custom);
    next.has(id) ? next.delete(id) : next.add(id);
    return { ...s, custom: next };
  });

  const count = (selected.saved ? 1 : 0) + (selected.watching ? 1 : 0) + selected.custom.size;

  const handleClear = () => {
    if (!count) return;
    onClear({ saved: selected.saved, watching: selected.watching, customListIds: [...selected.custom] });
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <SheetHeader title="Clear Lists" onClose={onClose} />
        <div style={{ padding: '1rem 1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 0.25rem' }}>
            Select which lists to clear. This can't be undone.
          </p>

          <ClearListRow
            checked={selected.saved}
            onToggle={toggleSaved}
            label="Saved"
            sublabel={`${savedCount} title${savedCount === 1 ? '' : 's'} · list stays, only the titles are cleared`}
          />
          <ClearListRow
            checked={selected.watching}
            onToggle={toggleWatching}
            label="Watching"
            sublabel={`${watchingCount} in progress · list stays, only the titles are cleared`}
          />

          {customLists.length > 0 && (
            <>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0.5rem 0 0.1rem' }}>
                Custom lists
              </div>
              {customLists.map(list => (
                <ClearListRow
                  key={list.id}
                  checked={selected.custom.has(list.id)}
                  onToggle={() => toggleCustom(list.id)}
                  label={list.name}
                  sublabel={`${list.items?.length ?? 0} title${(list.items?.length ?? 0) === 1 ? '' : 's'} · list will be deleted`}
                  danger
                />
              ))}
            </>
          )}

          <button
            className="btn btn-primary"
            style={{
              width: '100%', marginTop: '0.5rem',
              background: count ? 'var(--danger)' : 'var(--surface-raised)',
              borderColor: count ? 'var(--danger)' : 'var(--border)',
              color: count ? undefined : 'var(--text-muted)',
              cursor: count ? 'pointer' : 'default',
            }}
            onClick={handleClear}
            disabled={!count}
          >
            {count ? SETTINGS_VIEW.clearSelected(count) : SETTINGS_VIEW.selectListsToClear}
          </button>
        </div>
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
    ? allTzs.filter(tz => {
        const q = query.toLowerCase();
        return tz.toLowerCase().includes(q) || fmtTz(tz).toLowerCase().includes(q);
      })
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

        <div style={{ padding: '0.75rem 1rem 0', position: 'relative' }}>
          <input
            style={{
              width: '100%',
              padding: '0.6rem 2.25rem 0.6rem 1rem',
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
          {query && (
            <button
              type="button"
              className="search-input-clear"
              style={{ right: '1.75rem' }}
              onClick={() => setQuery('')}
              aria-label={COMMON.clearSearch}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
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
            aria-label={saving ? SETTINGS_VIEW.timezone.savingTimezone : SETTINGS_VIEW.timezone.saveTimezone}
          >
            {saving ? <Spinner size="button" ariaHidden /> : COMMON.save}
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
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '0.5rem 2.25rem 0.5rem 0.75rem',
                  background: 'var(--surface-raised)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: '0.9rem', color: 'var(--text)',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              {search && (
                <button
                  type="button"
                  className="search-input-clear"
                  onClick={() => setSearch('')}
                  aria-label={COMMON.clearSearch}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <div className="providers-select-grid">
              {visible.map(p => (
                <div
                  key={p.provider_id}
                  className={`provider-select-card interactive-surface${chosen.includes(p.provider_id) ? ' selected' : ''}`}
                  onClick={() => toggle(p.provider_id)}
                  {...getButtonLikeProps({
                    onPress: () => toggle(p.provider_id),
                    label: `${chosen.includes(p.provider_id) ? COMMON.deselect : COMMON.select} ${p.provider_name}`,
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

/* ── Genre picker modal ── */
function GenrePicker({ selected, onSave, onClose }) {
  const { genres: allGenres, loading, error, retry } = useGenres();
  const [chosen, setChosen] = useState(
    allGenres.filter(g => selected.includes(g.name)).map(g => g.id)
  );

  useEffect(() => {
    if (allGenres.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local selection once genres load
    setChosen(allGenres.filter(g => selected.includes(g.name)).map(g => g.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed when the genre list itself loads
  }, [allGenres.length]);

  const toggle = (id) => {
    const next = chosen.includes(id) ? chosen.filter(i => i !== id) : [...chosen, id];
    setChosen(next);
    onSave(allGenres.filter(g => next.includes(g.id)).map(g => g.name));
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
          <SheetHeader title="Genres" onClose={onClose} />
        </div>
        {/* Keyed off `loading`, not `allGenres.length` — an empty list used to
            be indistinguishable from "still fetching", so a failed load left
            this sheet spinning forever with no way to recover. */}
        {loading ? (
          <div className="loading-state"><PlotLoader size="sm" /></div>
        ) : error ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {SETTINGS_VIEW.genres.loadError}
            </p>
            <button type="button" className="btn btn-secondary" onClick={retry}>
              {SETTINGS_VIEW.genres.tryAgain}
            </button>
          </div>
        ) : (
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {allGenres.map(g => (
                <div
                  key={g.id}
                  className={`interactive-surface${chosen.includes(g.id) ? ' selected' : ''}`}
                  onClick={() => toggle(g.id)}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: 'var(--radius-pill)',
                    border: chosen.includes(g.id) ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                    background: chosen.includes(g.id) ? 'var(--accent-dim)' : 'var(--surface)',
                    color: chosen.includes(g.id) ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  {...getButtonLikeProps({
                    onPress: () => toggle(g.id),
                    label: `${chosen.includes(g.id) ? COMMON.deselect : COMMON.select} ${g.name}`,
                    pressed: chosen.includes(g.id),
                  })}
                >
                  {g.name}
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
// AVATAR_MAX_MB comes from @plot/core/profileFields.js so the public profile
// page's picker enforces the same cap this one does.
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
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 500, marginBottom: '0.25rem' }}>
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
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>{COMMON.cancel}</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !nat}
            aria-busy={saving}
          >
            {saving ? <Spinner size="button" ariaHidden /> : SETTINGS_VIEW.avatar.savePhoto}
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
    const check = validateAvatarFile(file);
    if (!check.ok) {
      onError(check.reason === 'too-large'
        ? SETTINGS_VIEW.avatar.tooLarge(check.maxMb)
        : SETTINGS_VIEW.avatar.chooseImageFile);
      return;
    }
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
    if (upErr) { setBusy(false); onError(upErr.message || SETTINGS_VIEW.avatar.uploadFailed); return; }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so a replaced photo at the same path refreshes immediately.
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: dbErr } = await updateProfile({ userId: user.id, patch: { avatar_url: publicUrl } });
    setBusy(false);
    closeCrop();
    if (dbErr) { onError(dbErr.message || SETTINGS_VIEW.avatar.saveFailed); return; }
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
    const { error } = await updateProfile({ userId: user.id, patch: { avatar_url: null } });
    setBusy(false);
    if (error) { onError(error.message || SETTINGS_VIEW.avatar.removeFailed); return; }
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
              fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initial}
          </div>
          <div>
            <div className="settings-row-label">{SETTINGS_VIEW.avatar.profilePhoto}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {busy ? COMMON.saving : avatarUrl ? SETTINGS_VIEW.avatar.shownOnProfile : SETTINGS_VIEW.avatar.sizeHint(AVATAR_MAX_MB)}
            </div>
          </div>
        </div>
        <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
          <SettingsTextAction onClick={handlePick} disabled={busy}>
            {avatarUrl ? SETTINGS_VIEW.avatar.change : SETTINGS_VIEW.avatar.addPhoto}
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
    label: SETTINGS_VIEW.feedback.bugReportLabel,
    icon: '✦',
    description: SETTINGS_VIEW.feedback.bugReportDescription,
  },
  {
    id: 'feature',
    label: SETTINGS_VIEW.feedback.featureRequestLabel,
    icon: '✳',
    description: SETTINGS_VIEW.feedback.featureRequestDescription,
  },
  {
    id: 'general',
    label: SETTINGS_VIEW.feedback.generalFeedbackLabel,
    icon: '✺',
    description: SETTINGS_VIEW.feedback.generalFeedbackDescription,
  },
];

const FEEDBACK_MAX = 4000;
const MAX_IMAGES   = 3;
const MAX_IMAGE_MB = 5;

/**
 * Blocked accounts, with unblock. Guideline 1.2 asks for a visible list, not
 * just the act of blocking: a block you cannot find again is a block you cannot
 * undo.
 *
 * This renders identity for accounts the ordinary paths deliberately hide from
 * the viewer, which is why useBlocks reads through the list_blocked_users RPC
 * rather than selecting a table.
 */
function BlockedAccounts({ viewerId }) {
  const { blocked, loading, busy, unblock } = useBlocks(viewerId);

  return (
    <div className="settings-group">
      <div className="settings-group-title">{MODERATION.blockedTitle}</div>
      {loading ? null : blocked.length === 0 ? (
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{MODERATION.blockedEmpty}</div>
          </div>
        </div>
      ) : (
        blocked.map(account => (
          <div key={account.id} className="settings-row" style={{ cursor: 'default' }}>
            <div className="settings-row-left">
              <div>
                <div className="settings-row-label">{account.display_name || account.username}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{account.username}</div>
              </div>
            </div>
            <SettingsTextAction onClick={() => unblock(account.id)} disabled={busy}>
              {MODERATION.unblockAction}
            </SettingsTextAction>
          </div>
        ))
      )}
    </div>
  );
}

export function FeedbackPanel({ user, initialType, onClose, allTypes = false }) {
  // "Report a Bug" (initialType 'bug') only offers the bug card; "Leave Feedback"
  // (any other entry point) offers feature request + general feedback only.
  // The sidebar combines all feedback entry points in one composer.
  const visibleTypes = allTypes ? FEEDBACK_TYPES : initialType === 'bug'
    ? FEEDBACK_TYPES.filter(entry => entry.id === 'bug')
    : FEEDBACK_TYPES.filter(entry => entry.id !== 'bug');
  const [type,      setType]      = useState(allTypes ? 'general' : initialType === 'bug' ? 'bug' : visibleTypes[0].id);
  const [message,   setMessage]   = useState('');
  const [images,    setImages]    = useState([]); // [{ file, preview }]
  const [status,    setStatus]    = useState('idle'); // idle | submitting | done | error
  const [errorMessage, setErrorMessage] = useState('');
  const imagesRef = useRef([]);
  const selectedType = visibleTypes.find(entry => entry.id === type) || visibleTypes[0];
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
      setErrorMessage(SETTINGS_VIEW.feedback.notSaved);
      return;
    }

    setStatus('done');
    track(EVENTS.FEEDBACK_SUBMITTED, { type, has_attachments: attachmentUrls.length > 0 });
  };

  return createPortal(
<>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
          <SheetHeader title="Send feedback" onClose={onClose} />
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
            <button className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={onClose}>{COMMON.done}</button>
          </div>
        ) : (
          <div className="feedback-panel-body">
            <div className="feedback-panel-intro">
              <p>
                Found a bug, have a feature idea, or want to sharpen the product taste? Send it here.
              </p>
            </div>

            <div className="feedback-type-grid">
              {visibleTypes.map(entry => (
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
                {errorMessage || COMMON.genericError}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{
                width: '100%', marginTop: '0.25rem',
                background: message.trim() ? undefined : 'var(--surface-raised)',
                borderColor: message.trim() ? undefined : 'var(--border)',
                color: message.trim() ? undefined : 'var(--text-muted)',
                cursor: message.trim() ? 'pointer' : 'default',
              }}
              onClick={handleSubmit}
              disabled={!message.trim() || status === 'submitting'}
            >
              {status === 'submitting' ? COMMON.sending : COMMON.send}
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
  const { profile, user, theme, setTheme, refreshProfile, watchlist, watching, reminders, customLists } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = SETTINGS_SECTIONS.some(item => item.id === searchParams.get('section')) ? searchParams.get('section') : 'account';
  const changeSection = (section) => {
    setActionError(null);
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('section', section); return next; });
  };
  const sync  = useMediaSync(user?.id);
  const trakt = useTraktSync(user?.id);
  const simkl = useSimklSync(user?.id);
  const premium = usePremium(profile);
  const { events: calEvents, loading: calLoading } = useCalendar(
    watchlist?.items ?? [],
    watching?.items ?? [],
    watching?.fetchSeason,
    reminders?.reminders ?? [],
  );

  const [showProviders,       setShowProviders]       = useState(false);
  const [savingProviders,     setSavingProviders]     = useState(false);
  const [savingMarketingEmails, setSavingMarketingEmails] = useState(false);
  const [savingKidsContent, setSavingKidsContent] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [providerDraft,       setProviderDraft]       = useState(null);
  const [showGenres,          setShowGenres]          = useState(false);
  const [savingGenres,        setSavingGenres]        = useState(false);
  const [genreDraft,          setGenreDraft]          = useState(null);
  const [showRegion,          setShowRegion]          = useState(false);
  const [showTimezone,        setShowTimezone]        = useState(false);
  const [feedbackType,        setFeedbackType]        = useState(null);
  const [showClearWatchlist,  setShowClearWatchlist]  = useState(false);
  const [confirmSignOut,      setConfirmSignOut]      = useState(false);
  const [clearingHistory,     setClearingHistory]     = useState(false);
  const [clearingWatchlist,   setClearingWatchlist]   = useState(false);
  const [generatingCalToken,  setGeneratingCalToken]  = useState(false);
  const [exportingData,       setExportingData]       = useState(false);
  const [calTokenCopied,      setCalTokenCopied]      = useState(false);
  const [localCalToken,       setLocalCalToken]       = useState(null);
  const [usernameDraft,       setUsernameDraft]       = useState(null);
  const [usernameStatus,      setUsernameStatus]      = useState(null); // null|checking|available|taken|invalid|saving|saved|error
  const [nameDraft,           setNameDraft]           = useState(null); // null = display, string = editing
  const [savingName,          setSavingName]          = useState(false);
  const [nameError,           setNameError]           = useState(null);
  const [emailDraft,          setEmailDraft]          = useState(null); // null = display, string = editing
  const [emailSaving,         setEmailSaving]         = useState(false);
  const [emailError,          setEmailError]          = useState(null); // inline error shown while editing
  const [emailNotice,         setEmailNotice]         = useState(null); // post-save confirmation note shown in display mode
  const [resendVerifyStatus,  setResendVerifyStatus]  = useState(null); // null|sending|sent|error
  const [actionError,         setActionError]         = useState(null);
  const [confirmModal,        setConfirmModal]        = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  const [billingReturn,       setBillingReturn]       = useState(null); // null|'premium'|'tip'
  const premiumEventFired = useRef(false);

  const showConfirm = useCallback((opts) => setConfirmModal(opts), [setConfirmModal]);

  // Back from Stripe checkout: thank the user and re-pull the profile a few
  // times — the webhook that flips is_premium can lag the redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const tip = params.get('tip');
    if (!checkout && !tip) return;
    navigate('/settings?section=billing', { replace: true });
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
      track(EVENTS.PREMIUM_CONVERTED, {});
    }
  }, [billingReturn, profile?.is_premium]);

  // Use optimistic local value so the URL appears immediately after generation
  const calendarToken = localCalToken ?? profile?.calendar_token ?? null;
  const calFeedUrl = calendarToken ? edgeFunctionUrl('calendar-feed', { token: calendarToken }) : null;

  const { share: shareProfileLink, copied: profileUrlCopied } = useShare();

  const username      = profile?.username || '';
  const isPublic      = !!profile?.is_public;
  const usernameValue = usernameDraft ?? username;
  const usernameDirty = usernameValue.trim().toLowerCase() !== username.toLowerCase();
  const profileUrl    = buildProfileShareUrl({ username });
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
    if (!genreDraft) return;
    if (JSON.stringify(profile?.genres ?? []) !== JSON.stringify(genreDraft)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear optimistic state once persisted profile data catches up
    setGenreDraft(null);
    setSavingGenres(false);
  }, [profile?.genres, genreDraft]);

  // Load integrations on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { sync.loadIntegration(); }, [sync.loadIntegration]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { trakt.loadIntegration(); }, [trakt.loadIntegration]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIntegration is provided by the integration controller
  useEffect(() => { simkl.loadIntegration(); }, [simkl.loadIntegration]);

  const providers      = providerDraft ?? profile?.streaming_providers ?? [];
  const marketingEmailsEnabled = !!profile?.marketing_emails;
  const genres         = genreDraft ?? profile?.genres ?? [];
  const region         = profile?.region || DEFAULT_REGION;
  const timezone  = profile?.timezone || '';
  const includeKidsContent = profile?.include_kids_content ?? true;

  const saveProviders = async (newProviders) => {
    setActionError(null);
    setProviderDraft(newProviders);
    setSavingProviders(true);

    const { error } = await updateProfile({ userId: user.id, patch: { streaming_providers: newProviders } });

    setSavingProviders(false);

    if (error) {
      setActionError(error.message || SETTINGS_VIEW.errors.failedToSaveStreamingPlatforms);
      return false;
    }

    refreshProfile();
    return true;
  };


  const saveGenres = async (newGenres) => {
    setActionError(null);
    setGenreDraft(newGenres);
    setSavingGenres(true);

    const { error } = await updateProfile({ userId: user.id, patch: { genres: newGenres } });

    setSavingGenres(false);

    if (error) {
      setActionError(error.message || SETTINGS_VIEW.errors.failedToSaveGenres);
      return false;
    }

    refreshProfile();
    return true;
  };

  const handleToggleKidsContent = async () => {
    if (savingKidsContent) return;
    setSavingKidsContent(true);
    setActionError(null);
    const { error } = await updateProfile({ userId: user.id, patch: { include_kids_content: !includeKidsContent } });
    setSavingKidsContent(false);
    if (error) { setActionError(error.message); return; }
    refreshProfile();
  };

  // Marketing consent, so it only ever moves on a deliberate action here (or in
  // the digest prompt). A database trigger mirrors the flag onto the sending
  // list, which is also what an unsubscribe link writes back to.
  const toggleMarketingEmails = async () => {
    if (savingMarketingEmails) return;
    const next = !marketingEmailsEnabled;
    setActionError(null);
    setSavingMarketingEmails(true);
    const { error } = await updateProfile({ userId: user.id, patch: { marketing_emails: next } });
    setSavingMarketingEmails(false);
    if (error) {
      setActionError(error.message || SETTINGS_VIEW.errors.failedToUpdateMarketingEmails);
      return;
    }
    track(next ? EVENTS.MARKETING_EMAILS_OPTED_IN : EVENTS.MARKETING_EMAILS_OPTED_OUT, { source: 'settings' });
    refreshProfile();
  };

  const saveRegion = async (code) => {
    setActionError(null);
    const { error } = await updateProfile({ userId: user.id, patch: { region: code } });

    if (error) {
      setActionError(error.message || SETTINGS_VIEW.region.failedToSaveRegion);
      return false;
    }

    setTmdbRegion(code);
    refreshProfile();
    setShowRegion(false);
    return true;
  };

  const saveTimezone = async (tz) => {
    await updateProfile({ userId: user.id, patch: { timezone: tz } });
    setUserTimezone(tz);
    refreshProfile();
    setShowTimezone(false);
    // Clear any pending nudge dismissal so the banner doesn't re-appear
    try { localStorage.removeItem('plot_tz_dismissed'); } catch { /* storage unavailable */ }
  };

  const handleClearHistory = () => {
    showConfirm({
      title: SETTINGS_VIEW.confirm.clearWatchHistoryTitle,
      message: SETTINGS_VIEW.confirm.clearWatchHistoryMessage,
      confirmLabel: SETTINGS_VIEW.confirm.clearHistory,
      danger: true,
      onConfirm: async () => {
        setActionError(null);
        setClearingHistory(true);
        const { error } = await clearWatchHistory({ userId: user.id });
        setClearingHistory(false);
        if (error) {
          setActionError(error.message || SETTINGS_VIEW.errors.failedToClearWatchHistory);
          return false;
        }
        track(EVENTS.HISTORY_CLEARED, {});
        return true;
      },
    });
  };

  const handleClearLists = async ({ saved, watching: clearWatching, customListIds }) => {
    setActionError(null);
    setShowClearWatchlist(false);
    setClearingWatchlist(true);

    let myListId = null;
    if (saved) {
      const { data: myList, error: listLookupError } = await supabase.from('lists')
        .select('id').eq('user_id', user.id).eq('name', 'My List').maybeSingle();
      if (listLookupError) {
        setActionError(listLookupError.message || SETTINGS_VIEW.errors.failedToClearLists);
        setClearingWatchlist(false);
        return;
      }
      myListId = myList?.id ?? null;
    }

    const results = await Promise.all([
      saved && myListId ? supabase.from('list_items').delete().eq('list_id', myListId) : Promise.resolve({ error: null }),
      clearWatching ? supabase.from('watching_progress').delete().eq('user_id', user.id) : Promise.resolve({ error: null }),
      ...customListIds.map(id => customLists.deleteList(id).then(ok => ({ error: ok ? null : new Error(SETTINGS_VIEW.errors.failedToDeleteCustomList) }))),
    ]);
    const firstError = results.find(result => result.error)?.error;
    if (firstError) {
      setActionError(firstError.message || SETTINGS_VIEW.errors.failedToClearLists);
      setClearingWatchlist(false);
      return;
    }

    await Promise.all([
      saved ? watchlist.reload() : Promise.resolve(),
      clearWatching ? watching.reload() : Promise.resolve(),
    ]);
    track(EVENTS.WATCHLIST_CLEARED, { saved, watching: clearWatching, customListCount: customListIds.length });
    setClearingWatchlist(false);
  };

  const handleDeleteAccount = () => {
    showConfirm({
      title: SETTINGS_VIEW.confirm.deleteAccountTitle,
      message: SETTINGS_VIEW.confirm.deleteAccountMessage,
      confirmLabel: SETTINGS_VIEW.confirm.deleteAccount,
      danger: true,
      confirmPhrase: SETTINGS_VIEW.confirm.deleteAccountPhrase,
      onConfirm: async (typedPhrase) => {
        setActionError(null);
        const result = await deleteAccountAndSignOut({
          supabase,
          fetchImpl: fetch,
          deleteAccountUrl: edgeFunctionUrl('delete-account'),
          confirmationPhrase: typedPhrase,
          onDeleted: async () => {
            track(EVENTS.ACCOUNT_DELETED, {});
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
      track(EVENTS.DATA_EXPORTED, { format });
    } catch (err) {
      setActionError(err?.message || SETTINGS_VIEW.errors.failedToExportData);
    } finally {
      setExportingData(false);
    }
  };

  const handleGenerateCalToken = async () => {
    setGeneratingCalToken(true);
    const token = crypto.randomUUID();
    const { error } = await updateProfile({ userId: user.id, patch: { calendar_token: token } });
    if (error) {
      console.error('[calendar] failed to save token:', error.message);
      setGeneratingCalToken(false);
      return;
    }
    setLocalCalToken(token);
    setGeneratingCalToken(false);
    track(EVENTS.CALENDAR_FEED_GENERATED, {});
    refreshProfile();
  };

  const handleRevokeCalToken = () => {
    showConfirm({
      title: SETTINGS_VIEW.confirm.revokeCalendarLinkTitle,
      message: SETTINGS_VIEW.confirm.revokeCalendarLinkMessage,
      confirmLabel: SETTINGS_VIEW.confirm.revoke,
      danger: true,
      onConfirm: async () => {
        await updateProfile({ userId: user.id, patch: { calendar_token: null } });
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
    const { error } = await updateProfile({ userId: user.id, patch: { username: candidate } });
    if (error) { setUsernameStatus(isDuplicateUsernameError(error) ? 'taken' : 'error'); return; }
    setUsernameDraft(null);
    setUsernameStatus('saved');
    setTimeout(() => setUsernameStatus(null), 2000);
    refreshProfile();
  };

  // ── Name change ───────────────────────────────────────────────────────────
  const currentName = profile?.display_name || '';
  const nameValue    = nameDraft ?? '';
  const nameDirty    = nameDraft !== null && nameValue.trim() !== currentName.trim();

  const startEditName  = () => { setNameError(null); setNameDraft(currentName); };
  const cancelEditName = () => { setNameDraft(null); setNameError(null); };

  const handleSaveName = async () => {
    const next = nameValue.trim();
    if (next === currentName.trim()) { cancelEditName(); return; }
    if (!next) { setNameError(SETTINGS_VIEW.errors.enterAName); return; }
    if (next.length > 50) { setNameError('Keep it under 50 characters.'); return; }
    setSavingName(true);
    setNameError(null);
    const { error } = await updateProfile({ userId: user.id, patch: { display_name: next } });
    setSavingName(false);
    if (error) { setNameError(error.message || SETTINGS_VIEW.errors.couldNotUpdateName); return; }
    setNameDraft(null);
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
  // Confirm email is off at the Supabase project level, so signup no longer
  // blocks on this — it's surfaced here instead, checkable any time.
  const emailVerified = !!user?.email_confirmed_at;

  const startEditEmail  = () => { setEmailNotice(null); setEmailError(null); setEmailDraft(currentEmail); };
  const cancelEditEmail = () => { setEmailDraft(null); setEmailError(null); };

  const handleResendVerification = async () => {
    if (resendVerifyStatus === 'sending' || resendVerifyStatus === 'sent') return;
    setResendVerifyStatus('sending');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: currentEmail,
      options: { emailRedirectTo: getAuthCallbackUrl() },
    });
    setResendVerifyStatus(error ? 'error' : 'sent');
  };

  const handleSaveEmail = async () => {
    const next = emailValue.trim();
    if (next.toLowerCase() === currentEmail.toLowerCase()) { cancelEditEmail(); return; }
    if (!EMAIL_RE.test(next)) { setEmailError(SETTINGS_VIEW.errors.enterAValidEmail); return; }
    setEmailSaving(true);
    setEmailError(null);
    const { error } = await supabase.auth.updateUser({ email: next });
    setEmailSaving(false);
    if (error) {
      setEmailError(
        /already|registered|exists|in use/i.test(error.message || '')
          ? SETTINGS_VIEW.errors.emailAlreadyInUse
          : (error.message || SETTINGS_VIEW.errors.couldNotUpdateEmail)
      );
      return;
    }
    setEmailDraft(null);
    setEmailNotice(`We sent a confirmation link to ${next}. Your email updates once you open it.`);
  };

  const handleTogglePublic = async () => {
    if (savingVisibility || !user) return;
    setSavingVisibility(true);
    const { error } = await updateProfile({ userId: user.id, patch: { is_public: !isPublic } });
    setSavingVisibility(false);
    if (error) { setActionError(error.message); return; }
    track(EVENTS.PROFILE_VISIBILITY_CHANGED, { is_public: !isPublic });
    refreshProfile();
  };

  const handleShareProfile = () => {
    if (!profileUrl) return;
    // Native share sheet where available, clipboard fallback otherwise.
    return shareProfileLink({
      url: profileUrl,
      title: username ? SETTINGS_VIEW.shareTitleWithUsername(username) : SETTINGS_VIEW.shareTitleDefault,
      text: SHARING.profileText(profile?.display_name || username),
      event: 'profile_shared',
    });
  };

  return (
    <>
      <SettingsPage
        section={activeSection}
        onSection={changeSection}
        onSignOut={() => setConfirmSignOut(true)}
        account={{
          name: profile?.display_name || username || currentEmail,
          username,
          avatarUrl: profile?.avatar_url || null,
          isPremium: premium.isPremium,
        }}
      >
        {actionError && <p className="settings-error" role="alert">{actionError}</p>}
        {activeSection === 'account' && <>
      {/* Public profile */}
      <div className="settings-group">
        <div className="settings-group-title">Profile</div>
        <AvatarSetting
          user={user}
          profile={profile}
          refreshProfile={refreshProfile}
          onError={setActionError}
        />

        {/* Username */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left" style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="settings-row-label">Username</div>
              {usernameDraft === null ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                    {usernameStatus === 'checking' && SETTINGS_VIEW.username.checkingAvailability}
                    {usernameStatus === 'available' && SETTINGS_VIEW.username.available}
                    {usernameStatus === 'taken' && SETTINGS_VIEW.username.taken}
                    {usernameStatus === 'invalid' && SETTINGS_VIEW.username.formatHint}
                    {usernameStatus === 'saving' && COMMON.saving}
                    {usernameStatus === 'saved' && SETTINGS_VIEW.username.saved}
                    {usernameStatus === 'error' && SETTINGS_VIEW.username.error}
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

      </div>
      {/* Account */}
      <div className="settings-group" style={{ marginTop: '0.75rem' }}>
        <div className="settings-group-title">Account</div>
        <div className="settings-row" style={{ cursor: 'default', alignItems: nameDraft === null ? 'center' : 'flex-start' }}>
          <div className="settings-row-left" style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            {nameDraft === null ? (
              <div style={{ minWidth: 0 }}>
                <span className="settings-row-label" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentName || SETTINGS_VIEW.addYourName}
                </span>
              </div>
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="settings-row-label">Name</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
                  <input
                    type="text"
                    value={nameValue}
                    maxLength={50}
                    autoFocus
                    aria-label="Name"
                    onChange={(e) => { setNameDraft(e.target.value); if (nameError) setNameError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && nameDirty && !savingName) handleSaveName();
                      if (e.key === 'Escape') cancelEditName();
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
                  color: nameError ? 'var(--danger)' : 'var(--text-muted)',
                }}>
                  {nameError || (savingName ? 'Saving…' : '')}
                </div>
              </div>
            )}
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            {nameDraft === null ? (
              <SettingsTextAction onClick={startEditName}>{COMMON.edit}</SettingsTextAction>
            ) : (
              <>
                <SettingsTextAction onClick={cancelEditName}>{COMMON.cancel}</SettingsTextAction>
                <SettingsTextAction onClick={handleSaveName} disabled={savingName || !nameDirty}>{COMMON.save}</SettingsTextAction>
              </>
            )}
          </div>
        </div>

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
                {!emailNotice && !emailVerified && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', marginTop: '0.3rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    <span>Not verified</span>
                    <SettingsTextAction
                      onClick={handleResendVerification}
                      disabled={resendVerifyStatus === 'sending' || resendVerifyStatus === 'sent'}
                    >
                      {resendVerifyStatus === 'sending' ? COMMON.sending : resendVerifyStatus === 'sent' ? SETTINGS_VIEW.verifyEmail.sent : resendVerifyStatus === 'error' ? SETTINGS_VIEW.verifyEmail.tryAgain : SETTINGS_VIEW.verifyEmail.verifyNow}
                    </SettingsTextAction>
                  </div>
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
              <SettingsTextAction onClick={startEditEmail}>{COMMON.edit}</SettingsTextAction>
            ) : (
              <>
                <SettingsTextAction onClick={cancelEditEmail}>{COMMON.cancel}</SettingsTextAction>
                <SettingsTextAction onClick={handleSaveEmail} disabled={emailSaving || !emailDirty}>{COMMON.save}</SettingsTextAction>
              </>
            )}
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
      <div className="settings-group"><div className="settings-group-title">{SETTINGS_VIEW.page.emailPreferences}</div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
            </div>
            <div>
              <div className="settings-row-label">{SETTINGS_VIEW.marketingEmails.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                {marketingEmailsEnabled
                  ? SETTINGS_VIEW.marketingEmails.onHint
                  : SETTINGS_VIEW.marketingEmails.offHint}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsSwitch label={SETTINGS_VIEW.marketingEmails.label} checked={marketingEmailsEnabled} disabled={savingMarketingEmails} onChange={toggleMarketingEmails} />
          </div>
        </div>
      </div>
        </>}
        {activeSection === 'viewing' && <>
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.page.whereYouWatch}</div>
        <SettingsPreferenceRow label={SETTINGS_VIEW.integrations.streamingPlatformsLabel} value={settingsSelectionSummary(providers)} disabled={savingProviders} onEdit={() => setShowProviders(true)} />
        <BroadcastAccountSettings />
        <SettingsPreferenceRow label={SETTINGS_VIEW.page.regionLabel} value={regionName(region)} onEdit={() => { setActionError(null); setShowRegion(true); }} />
        <SettingsPreferenceRow label={SETTINGS_VIEW.page.timezoneLabel} value={timezone ? fmtTz(timezone) : COMMON.notSet} onEdit={() => setShowTimezone(true)} />
      </div>
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.page.whatYouWatch}</div>
        <SettingsPreferenceRow label={SETTINGS_VIEW.integrations.genresLabel} value={genres.length ? SETTINGS_VIEW.integrations.selectedCount(genres.length) : SETTINGS_VIEW.page.noneSelected} disabled={savingGenres} onEdit={() => setShowGenres(true)} />
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="10" r="1"/><circle cx="15.5" cy="10" r="1"/><path d="M8 15s1.5 2 4 2 4-2 4-2"/></svg>
            </div>
            <div>
              <div className="settings-row-label">{SETTINGS_VIEW.kidsContent.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {includeKidsContent
                  ? SETTINGS_VIEW.kidsContent.onHint
                  : SETTINGS_VIEW.kidsContent.offHint}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsSwitch label={SETTINGS_VIEW.kidsContent.label} checked={includeKidsContent} disabled={savingKidsContent} onChange={handleToggleKidsContent} />
          </div>
        </div>

      </div>
        </>}
        {activeSection === 'connections' && <>
      <TrackingSettings userId={user?.id} connect={trakt.connect} connectPlex={sync.startPlexAuth} plexPolling={sync.polling} connectionError={trakt.error || sync.error} disconnect={provider => provider === 'trakt' ? trakt.disconnect() : sync.disconnect()} />
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.integrations.groupTitle}</div>
        {premium.isPremium && SHOW_MEDIA_SYNC_INTEGRATIONS ? (
          <>
            <div className="settings-row" style={{ cursor: 'default' }}>
              <div className="settings-row-left">
                <div className="settings-row-icon">{PLEX_ICON}</div>
                <div>
                  <div className="settings-row-label">{SETTINGS_VIEW.integrations.plexName}<PremiumBadge /></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {sync.isConnected ? SETTINGS_VIEW.integrations.connectedLastSynced(
                      sync.integration?.last_sync_at
                        ? new Date(sync.integration.last_sync_at).toLocaleDateString()
                        : SETTINGS_VIEW.integrations.never
                    ) : SETTINGS_VIEW.integrations.notConnected}
                  </div>
                </div>
              </div>
              <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
                {sync.isConnected ? (
                  <>
                    <SettingsTextAction onClick={sync.sync} disabled={sync.syncing}>
                      {sync.syncing ? COMMON.syncing : SETTINGS_VIEW.integrations.syncNow}
                    </SettingsTextAction>
                    <SettingsTextAction onClick={sync.disconnect} tone="danger">
                      {SETTINGS_VIEW.integrations.disconnect}
                    </SettingsTextAction>
                  </>
                ) : (
                  <SettingsTextAction onClick={sync.startPlexAuth}>
                    {SETTINGS_VIEW.integrations.connectPlex}
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
                  <div className="settings-row-label">{SETTINGS_VIEW.integrations.traktName}<PremiumBadge /></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {trakt.isConnected
                      ? SETTINGS_VIEW.integrations.connectedLastSynced(
                          trakt.integration?.last_sync_at
                            ? new Date(trakt.integration.last_sync_at).toLocaleDateString()
                            : SETTINGS_VIEW.integrations.never
                        )
                      : SETTINGS_VIEW.integrations.connectTraktToSync}
                  </div>
                </div>
              </div>
              <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
                {trakt.isConnected ? (
                  <>
                    <SettingsTextAction onClick={trakt.sync} disabled={trakt.syncing}>
                      {trakt.syncing ? COMMON.syncing : SETTINGS_VIEW.integrations.syncNow}
                    </SettingsTextAction>
                    <SettingsTextAction onClick={trakt.disconnect} tone="danger">
                      {SETTINGS_VIEW.integrations.disconnect}
                    </SettingsTextAction>
                  </>
                ) : (
                  <SettingsTextAction onClick={trakt.connect}>
                    {SETTINGS_VIEW.integrations.connectTrakt}
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
          <>
            {[
              { name: SETTINGS_VIEW.integrations.plexName, blurb: SETTINGS_VIEW.integrations.plexBlurb, connected: sync.isConnected, disconnect: sync.disconnect, icon: PLEX_ICON },
              { name: SETTINGS_VIEW.integrations.traktName, blurb: SETTINGS_VIEW.integrations.traktBlurb, connected: trakt.isConnected, disconnect: trakt.disconnect, icon: TRAKT_ICON },
            ].map(row => (
              <div key={row.name} className="settings-row">
                <div className="settings-row-left">
                  <div className="settings-row-icon">{row.icon}</div>
                  <div><div className="settings-row-label">{row.name}<PremiumBadge /></div><p className="settings-selection">{row.connected && !premium.isPremium ? SETTINGS_VIEW.integrations.pausedNeedsPremium : row.blurb}</p></div>
                </div>
                <div className="settings-inline-actions">
                  <SettingsTextAction onClick={() => showConfirm({
                    title: SETTINGS_VIEW.billing.syncComingSoon,
                    message: SETTINGS_VIEW.billing.syncComingSoonMessage,
                    confirmLabel: SETTINGS_VIEW.premium.upgradeButton,
                    onConfirm: () => navigate(premiumPlansPath('/settings?section=connections')),
                  })}>
                    {SETTINGS_VIEW.premium.upgradeButton}
                  </SettingsTextAction>
                  {row.connected && <SettingsTextAction onClick={row.disconnect} tone="danger">{SETTINGS_VIEW.integrations.disconnect}</SettingsTextAction>}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <div className="settings-row-icon">{SIMKL_ICON}</div>
            <div>
              <div className="settings-row-label">{SETTINGS_VIEW.integrations.simklName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {simkl.isConnected
                  ? SETTINGS_VIEW.integrations.connectedLastSynced(
                      simkl.integration?.last_sync_at
                        ? new Date(simkl.integration.last_sync_at).toLocaleDateString()
                        : SETTINGS_VIEW.integrations.never
                    )
                  : SETTINGS_VIEW.integrations.simklBlurb}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            {simkl.isConnected ? (
              <>
                <SettingsTextAction onClick={simkl.sync} disabled={simkl.syncing}>
                  {simkl.syncing ? COMMON.syncing : SETTINGS_VIEW.integrations.syncNow}
                </SettingsTextAction>
                <SettingsTextAction onClick={simkl.disconnect} tone="danger">
                  {SETTINGS_VIEW.integrations.disconnect}
                </SettingsTextAction>
              </>
            ) : (
              <SettingsTextAction onClick={simkl.connect}>
                {SETTINGS_VIEW.integrations.connectSimkl}
              </SettingsTextAction>
            )}
          </div>
        </div>
        {simkl.error && (
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', borderRadius: 8, margin: '0.25rem 1rem' }}>
            {simkl.error}
          </div>
        )}

        {/* ── Import watch history ── */}
        <div
          className="settings-row interactive-surface"
          onClick={() => navigate('/import')}
          style={{ cursor: 'pointer' }}
          {...getButtonLikeProps({ onPress: () => navigate('/import'), label: SETTINGS_VIEW.integrations.importWatchHistory })}
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
              <div className="settings-row-label">{SETTINGS_VIEW.integrations.importWatchHistoryLabel}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {SETTINGS_VIEW.integrations.importWatchHistoryHint}
              </div>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>

      </div>

      {/* Calendar */}
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.calendarFeed.groupTitle}</div>


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
                {SETTINGS_VIEW.calendarFeed.subscribeLabel}{!premium.isPremium && <PremiumBadge />}
              </div>
              <div className={!premium.isPremium ? 'settings-row-hint settings-row-hint--hide-mobile' : undefined} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {!premium.isPremium
                  ? SETTINGS_VIEW.calendarFeed.needsPremium
                  : (calendarToken ? SETTINGS_VIEW.calendarFeed.liveFeedPrivate : SETTINGS_VIEW.calendarFeed.getUrlHint)}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            {!premium.isPremium ? (
              <>
                <SettingsTextAction onClick={() => showConfirm({
                  title: SETTINGS_VIEW.billing.calendarComingSoon,
                  message: SETTINGS_VIEW.billing.calendarComingSoonMessage,
                  confirmLabel: SETTINGS_VIEW.premium.upgradeButton,
                  onConfirm: () => navigate(premiumPlansPath('/settings?section=connections')),
                })}>
                  {SETTINGS_VIEW.premium.upgradeButton}
                </SettingsTextAction>
                {calendarToken && (
                  <SettingsTextAction onClick={handleRevokeCalToken} tone="danger">
                    {SETTINGS_VIEW.confirm.revoke}
                  </SettingsTextAction>
                )}
              </>
            ) : calendarToken ? (
              <>
                <SettingsTextAction onClick={handleCopyCalUrl}>
                  {calTokenCopied ? COMMON.copied : SETTINGS_VIEW.calendarFeed.copyLink}
                </SettingsTextAction>
                <SettingsTextAction onClick={handleRevokeCalToken} tone="danger">
                  {SETTINGS_VIEW.confirm.revoke}
                </SettingsTextAction>
              </>
            ) : (
              <SettingsTextAction disabled={generatingCalToken} onClick={handleGenerateCalToken}>
                {generatingCalToken ? SETTINGS_VIEW.calendarFeed.generating : SETTINGS_VIEW.calendarFeed.generateLink}
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
              <div className="settings-row-label">{SETTINGS_VIEW.calendarFeed.exportLabel}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {calLoading ? SETTINGS_VIEW.calendarFeed.loadingEvents : SETTINGS_VIEW.calendarFeed.eventCount(calEvents.length)}
              </div>
            </div>
          </div>
          <SettingsTextAction
            disabled={calLoading || calEvents.length === 0}
            onClick={() => downloadICS(calEvents)}
          >
            {SETTINGS_VIEW.calendarFeed.downloadIcs}
          </SettingsTextAction>
        </div>

      </div>
        </>}
        {activeSection === 'billing' && <SettingsBilling
          isPremium={premium.isPremium} canManage={premium.canManage} billing={premium.billing} busy={premium.busy} error={premium.error} onManage={premium.openPortal}
          notice={billingReturn === 'tip' ? SETTINGS_VIEW.premium.thanksForTip : billingReturn === 'premium' ? (premium.isPremium ? SETTINGS_VIEW.premium.activeThankYou : SETTINGS_VIEW.billing.confirming) : null}
        />}
        {activeSection === 'privacy' && <>
          <div className="settings-group">
        {/* Visibility */}
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left" style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <div className="settings-row-label">{isPublic ? PROFILE_PRIVACY.publicLabel : PROFILE_PRIVACY.privateLabel}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isPublic
                  ? PROFILE_PRIVACY.publicDescription(favoriteWords(region).pluralLower)
                  : PROFILE_PRIVACY.privateDescription}
                {' '}{PROFILE_PRIVACY.notesAlwaysPrivate}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions" style={{ flexShrink: 0 }}>
            <SettingsSwitch label={SETTINGS_VIEW.page.privacyLabel} checked={isPublic} disabled={savingVisibility} onChange={handleTogglePublic} />
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
                {profileUrlCopied ? COMMON.copied : COMMON.share}
              </SettingsTextAction>
              <a className="settings-text-action" href={profileUrl} target="_blank" rel="noreferrer">
                <span>View</span><span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        )}


      </div>

          <BlockedAccounts viewerId={user?.id} />
          <div className="settings-group">
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
              <div className="settings-row-label">{SETTINGS_VIEW.export.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {SETTINGS_VIEW.export.hint}
              </div>
            </div>
          </div>
          <div className="settings-inline-actions settings-inline-actions--stack-mobile" style={{ flexShrink: 0 }}>
            <SettingsTextAction
              disabled={!!exportingData}
              onClick={() => handleExportData('json')}
            >
              {exportingData === 'json' ? SETTINGS_VIEW.export.preparing : SETTINGS_VIEW.export.downloadJson}
            </SettingsTextAction>
            <SettingsTextAction
              disabled={!!exportingData}
              onClick={() => handleExportData('csv')}
            >
              {exportingData === 'csv' ? SETTINGS_VIEW.export.preparing : SETTINGS_VIEW.export.downloadCsv}
            </SettingsTextAction>
          </div>
        </div>
          </div>
<details className="settings-danger-details"><summary>{SETTINGS_VIEW.page.resetData}</summary>      {/* Danger zone */}
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.dangerZone.groupTitle}</div>

        <div
          className="settings-row interactive-surface"
          onClick={clearingWatchlist ? undefined : () => setShowClearWatchlist(true)}
          style={{ cursor: clearingWatchlist ? 'default' : 'pointer' }}
          {...getButtonLikeProps({
            onPress: () => setShowClearWatchlist(true),
            disabled: clearingWatchlist,
            label: SETTINGS_VIEW.dangerZone.clearListsAria,
          })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: clearingWatchlist ? 'var(--text-muted)' : undefined }}>
              {clearingWatchlist ? SETTINGS_VIEW.clearing : SETTINGS_VIEW.dangerZone.clearListsLabel}
            </span>
          </div>
          <span aria-hidden="true">→</span>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={clearingHistory ? undefined : handleClearHistory}
          style={{ cursor: clearingHistory ? 'default' : 'pointer' }}
          {...getButtonLikeProps({
            onPress: handleClearHistory,
            disabled: clearingHistory,
            label: SETTINGS_VIEW.dangerZone.clearWatchHistoryAria,
          })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: clearingHistory ? 'var(--text-muted)' : undefined }}>
              {clearingHistory ? SETTINGS_VIEW.clearing : SETTINGS_VIEW.dangerZone.clearWatchHistoryLabel}
            </span>
          </div>
          <span aria-hidden="true">→</span>
        </div>

        <div
          className="settings-row interactive-surface"
          onClick={handleDeleteAccount}
          style={{ color: 'var(--danger)' }}
          {...getButtonLikeProps({ onPress: handleDeleteAccount, label: SETTINGS_VIEW.dangerZone.deleteAccountAria })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <span className="settings-row-label" style={{ color: 'var(--danger)' }}>{SETTINGS_VIEW.dangerZone.deleteAccountLabel}</span>
          </div>
          <span aria-hidden="true">→</span>
        </div>
      </div>

</details>        </>}
        {activeSection === 'help' && <>
      {/* Support */}
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.support.groupTitle}</div>
        <div
          className="settings-row interactive-surface"
          onClick={() => setFeedbackType('bug')}
          {...getButtonLikeProps({ onPress: () => setFeedbackType('bug'), label: SETTINGS_VIEW.support.reportABugAria })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            </div>
            <span className="settings-row-label">{SETTINGS_VIEW.support.reportABugLabel}</span>
          </div>
          <div className="settings-row-value">
            <span aria-hidden="true">→</span>
          </div>
        </div>
        <div
          className="settings-row interactive-surface"
          onClick={() => setFeedbackType('feature')}
          {...getButtonLikeProps({ onPress: () => setFeedbackType('feature'), label: SETTINGS_VIEW.support.leaveFeedbackAria })}
        >
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span className="settings-row-label">{SETTINGS_VIEW.support.leaveFeedbackLabel}</span>
          </div>
          <div className="settings-row-value">
            <span aria-hidden="true">→</span>
          </div>
        </div>
      </div>

      {/* Credits — TMDB's API terms ask for the notice on an About/Credits
          surface, not only in the legal pages. See copy/settingsView.js. */}
      <div className="settings-group">
        <div className="settings-group-title">{SETTINGS_VIEW.credits.groupTitle}</div>
        <div className="settings-credits">
          <p className="settings-credits-intro">{SETTINGS_VIEW.credits.intro}</p>
          {/* TMDB also asks for their approved logo alongside this notice. Drop
              the official SVG at apps/web/public/tmdb.svg and swap this span for
              an <img src="/tmdb.svg" class="settings-credit-logo">; the style is
              already defined. Not shipped yet because the asset is theirs to
              provide, and a wrong or redrawn mark is worse than none. */}
          <div className="settings-credit">
            <span className="settings-credit-name">{SETTINGS_VIEW.credits.tmdbName}</span>
            <p className="settings-credit-notice">{SETTINGS_VIEW.credits.tmdbNotice}</p>
          </div>
          <div className="settings-credit">
            <span className="settings-credit-name">{SETTINGS_VIEW.credits.tvmazeName}</span>
            <p className="settings-credit-notice">{SETTINGS_VIEW.credits.tvmazeNotice}</p>
          </div>
          <div className="settings-credit">
            <span className="settings-credit-name">{SETTINGS_VIEW.credits.omdbName}</span>
            <p className="settings-credit-notice">{SETTINGS_VIEW.credits.omdbNotice}</p>
          </div>
        </div>
      </div>

      <div className="settings-legal-links">
        <a className="settings-text-action" href="/terms">{COMMON.termsOfService}<span aria-hidden="true">→</span></a>
        <a className="settings-text-action" href="/privacy">{COMMON.privacyPolicy}<span aria-hidden="true">→</span></a>
      </div>
        </>}
      </SettingsPage>
      {confirmSignOut && (
        <ConfirmModal
          title={SETTINGS_VIEW.page.signOutTitle}
          message={SETTINGS_VIEW.page.signOutMessage}
          confirmLabel={SETTINGS_VIEW.signOut}
          onConfirm={() => { navigate('/logout'); return true; }}
          onClose={() => setConfirmSignOut(false)}
        />
      )}

      {/* Provider picker modal */}
      {showProviders && (
        <ProviderPicker
          title={SETTINGS_VIEW.myPlatforms}
          region={region}
          selected={providers}
          onSave={saveProviders}
          onClose={() => {
            setShowProviders(false);
            if (!savingProviders) setProviderDraft(null);
          }}
        />
      )}


      {showGenres && (
        <GenrePicker
          selected={genres}
          onSave={saveGenres}
          onClose={() => {
            setShowGenres(false);
            if (!savingGenres) setGenreDraft(null);
          }}
        />
      )}

      {/* Clear Lists modal */}
      {showClearWatchlist && (
        <ClearWatchlistModal
          savedCount={watchlist.items?.length ?? 0}
          watchingCount={watching.items?.length ?? 0}
          customLists={customLists.lists}
          onClear={handleClearLists}
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
    </>
  );
}
