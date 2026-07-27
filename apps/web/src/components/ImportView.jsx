import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import { supabase } from '../api/supabase.js';
import { parsePlatform } from '../domain/importParsing.js';
import { dedupeEntries } from '../domain/importDedup.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { track, EVENTS } from '../lib/analytics.js';

/* ─────────────────────────── Platform icons ─────────────────────────── */

// Stable TMDB provider IDs for each platform
const PLATFORM_PROVIDER_IDS = {
  netflix: 8,
  prime:   9,
  disney:  337,
  max:     1899,
  apple:   350,
};

function PlatformIcon({ id, logoPath, size = 32 }) {
  if (logoPath) {
    return (
      <img
        src={`https://image.tmdb.org/t/p/w45${logoPath}`}
        alt={id}
        style={{ width: size, height: size, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }}
      />
    );
  }
  // Fallback: colored square while loading
  const colors = { netflix: '#E50914', prime: '#00A8E0', disney: '#113CCF', max: '#002BE7', apple: '#555', letterboxd: '#00E054' };
  return <div style={{ width: size, height: size, borderRadius: 8, background: colors[id] || '#333', flexShrink: 0 }} />;
}

/* ─────────────────────────── Platform config ─────────────────────────── */

const PLATFORMS = [
  {
    id: 'netflix',
    name: 'Netflix',
    color: '#E50914',
    format: 'CSV',
    shortInstructions: 'Account → Profile & Parental Controls → Viewing activity → Download all',
    instructions: [
      'Go to netflix.com and sign in',
      'Click your profile icon → Account',
      'Scroll to "Profile & Parental Controls" → your profile',
      'Click "Viewing activity"',
      'Click "Download all" at the bottom',
      'Upload the downloaded NetflixViewingHistory.csv file',
    ],
  },
  {
    id: 'prime',
    name: 'Amazon Prime',
    color: '#00A8E0',
    format: 'CSV',
    shortInstructions: 'Account → Data & Privacy → Request your data → Digital content → Download ZIP',
    instructions: [
      'Go to amazon.com and sign in',
      'Go to Account → Data & Privacy → Request your data',
      'Select "Digital content" and submit the request',
      'Download the ZIP when ready, extract the CSV file inside',
      'Upload the CSV file here',
    ],
  },
  {
    id: 'disney',
    name: 'Disney+',
    color: '#113CCF',
    format: 'JSON',
    shortInstructions: 'Go to privacy.disneyplus.com → Request your data → Download ZIP → upload JSON',
    instructions: [
      'Go to privacy.disneyplus.com and sign in',
      'Click "Request your data"',
      'Download the ZIP when ready',
      'Extract and find the JSON file for watch history',
      'Upload the JSON file here',
    ],
  },
  {
    id: 'max',
    name: 'Max (HBO)',
    color: '#002BE7',
    format: 'CSV or JSON',
    shortInstructions: 'Go to privacycenter.max.com → Download your data → upload the file',
    instructions: [
      'Go to privacycenter.max.com and sign in',
      'Click "Download your data"',
      'Download the file when ready',
      'Upload the CSV or JSON file here',
    ],
  },
  {
    id: 'apple',
    name: 'Apple TV+',
    color: '#555555',
    format: 'JSON',
    shortInstructions: 'privacy.apple.com → Request a copy → Apple TV & Purchases → Download ZIP → upload JSON',
    instructions: [
      'Go to privacy.apple.com and sign in',
      'Click "Request a copy of your data"',
      'Select "Apple TV & Purchases"',
      'Download the ZIP when ready',
      'Extract and find the JSON file for TV interactions',
      'Upload the JSON file here',
    ],
  },
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    color: '#00E054',
    format: 'CSV',
    shortInstructions: 'Settings → Data → Export your data → unzip → upload diary.csv',
    instructions: [
      'Go to letterboxd.com and sign in',
      'Open Settings → Data (letterboxd.com/settings/data)',
      'Click "Export your data" to download the ZIP',
      'Unzip it and find diary.csv (or watched.csv)',
      'Upload that CSV file here. Your ratings and reviews come across too',
    ],
  },
];

/* Platform parsers (parseNetflix/Prime/Disney/Max/Apple/Letterboxd + parsePlatform)
   now live in the shared core: @plot/core/importParsing.js. */

// Normalise a parsed entry's date into the history's watched_at format —
// shared by the import write and every "already have this exact watch"
// check so they agree on what counts as a duplicate.
function watchedAtFor(r) {
  return r.date
    ? new Date(r.date + 'T12:00:00').toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

/* ─────────────────────────── TMDB resolution ─────────────────────────── */

async function resolveTitle(entry) {
  try {
    const res = await tmdb.search(entry.title);
    let results = res?.results || [];
    // Narrow to the hinted media type when we have one (falls back to all results)
    if (entry.hint && entry.hint !== 'unknown') {
      const typed = results.filter(r => r.media_type === entry.hint);
      if (typed.length) results = typed;
    }
    // Default to the most popular match, but if we know the release year
    // (Letterboxd) prefer an exact year match to disambiguate remakes/same titles
    let preferred = results[0];
    if (entry.year) {
      const yearMatch = results.find(r => {
        const d = r.release_date || r.first_air_date || '';
        return d.slice(0, 4) === String(entry.year);
      });
      if (yearMatch) preferred = yearMatch;
    }
    if (!preferred) return { ...entry, status: 'unmatched' };
    return {
      ...entry,
      status: 'matched',
      tmdbId: preferred.id,
      mediaType: preferred.media_type,
      tmdbTitle: preferred.title || preferred.name,
      posterPath: preferred.poster_path,
    };
  } catch {
    return { ...entry, status: 'unmatched' };
  }
}

async function resolveAll(entries, onProgress) {
  const BATCH = 4;
  const DELAY = 250;
  const results = [];
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const resolved = await Promise.all(batch.map(resolveTitle));
    results.push(...resolved);
    onProgress(results.length, entries.length);
    if (i + BATCH < entries.length) await new Promise(r => setTimeout(r, DELAY));
  }
  return results;
}

/* ─────────────────────────── Bulk insert ─────────────────────────── */

async function bulkInsert(userId, rows, logRewatches) {
  const BATCH = 50;
  let inserted = 0;
  if (!logRewatches) {
    // Collapsing to one row per title: clear existing rows for these titles
    // first since there's no more DB-level unique(user_id,tmdb_id) to
    // upsert against (it was relaxed so rewatches can coexist).
    const tmdbIds = [...new Set(rows.map(r => r.tmdb_id))];
    if (tmdbIds.length) await supabase.from('history').delete().eq('user_id', userId).in('tmdb_id', tmdbIds);
  }
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = logRewatches
      ? await supabase.from('history').upsert(batch, { onConflict: 'user_id,tmdb_id,watched_at' })
      : await supabase.from('history').insert(batch);
    if (!error) inserted += batch.length;
  }
  return inserted;
}

/* ─────────────────────────── UI helpers ─────────────────────────── */

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}

function PosterThumb({ path }) {
  if (!path) return <div style={{ width: 36, height: 54, borderRadius: 4, background: 'var(--surface-raised)', flexShrink: 0 }} />;
  return (
    <img
      src={`https://image.tmdb.org/t/p/w92${path}`}
      alt=""
      style={{ width: 36, height: 54, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}

/* ─────────────────────────── Main component ─────────────────────────── */

export default function ImportView() {
  const { user, profile } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1=platform 2=file 3=resolving 4=preview 5=done
  const [platform, setPlatform] = useState(null);
  const [parseError, setParseError] = useState('');
  const [resolveProgress, setResolveProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [existingIds, setExistingIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [providerLogos, setProviderLogos] = useState({});
  const fileRef = useRef(null);

  useEffect(() => {
    tmdb.getWatchProvidersForRegion('movie', 'US').then(res => {
      const logos = {};
      (res?.results || []).forEach(p => {
        for (const [platformId, tmdbId] of Object.entries(PLATFORM_PROVIDER_IDS)) {
          if (p.provider_id === tmdbId) logos[platformId] = p.logo_path;
        }
      });
      setProviderLogos(logos);
    }).catch(() => {});
  }, []);

  /* Step 2 → 3 → 4 */
  const handleFile = useCallback(async (file) => {
    setParseError('');
    const text = await file.text();
    let parsed;
    try {
      parsed = parsePlatform(platform.id, text);
    } catch (e) {
      setParseError(`Couldn't parse this file. Make sure you selected the right platform and the file is unmodified. (${e.message})`);
      return;
    }
    if (!parsed.length) {
      setParseError("No watch history found in this file. Check you exported from the right platform.");
      return;
    }

    const deduped = dedupeEntries(parsed);
    track(EVENTS.IMPORT_STARTED, { source: platform.id, count: deduped.length });

    setStep(3);
    setResolveProgress({ done: 0, total: deduped.length });

    const resolved = await resolveAll(deduped, (done, total) => {
      setResolveProgress({ done, total });
    });

    // Fetch existing (tmdb_id, watched_at) pairs, scoped to just the titles
    // this import resolved to — not the user's whole history, which would
    // grow unbounded as they log more over time.
    const resolvedIds = [...new Set(resolved.filter(r => r.status === 'matched').map(r => r.tmdbId))];
    const { data: existing } = resolvedIds.length
      ? await supabase.from('history').select('tmdb_id, watched_at').eq('user_id', user.id).in('tmdb_id', resolvedIds)
      : { data: [] };
    const ids = new Set((existing || []).map(r => `${r.tmdb_id}::${r.watched_at}`));
    setExistingIds(ids);

    setResults(resolved);
    setStep(4);
  }, [platform, user]);

  /* Step 4 → 5 */
  const handleImport = useCallback(async () => {
    setImporting(true);
    const toInsert = results
      .filter(r => r.status === 'matched')
      .map(r => {
        const watchedAt = watchedAtFor(r);
        const row = {
          user_id:    user.id,
          tmdb_id:    r.tmdbId,
          media_type: r.mediaType,
          title:      r.tmdbTitle,
          poster_path: r.posterPath || null,
          watched_at: watchedAt,
        };
        // Letterboxd carries ratings/reviews; clamp to the 1–10 history scale
        if (r.rating != null) row.rating = Math.min(10, Math.max(1, Math.round(r.rating)));
        if (r.note) row.note = r.note;
        return row;
      })
      // Only skip an exact (title, date) match already in the history — a
      // rewatch on a different date is a new entry, not a duplicate.
      .filter(row => !existingIds.has(`${row.tmdb_id}::${row.watched_at}`));

    const count = await bulkInsert(user.id, toInsert, profile?.log_rewatches ?? true);
    track(EVENTS.IMPORT_COMPLETED, { source: platform?.id, count });
    // Notify history hook to reload
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('plot:history-changed'));
    setImportedCount(count);
    setImporting(false);
    setStep(5);
  }, [results, existingIds, user, platform?.id, profile?.log_rewatches]);

  const newCount      = results.filter(r => r.status === 'matched' && !existingIds.has(`${r.tmdbId}::${watchedAtFor(r)}`)).length;
  const alreadyCount  = results.filter(r => r.status === 'matched' && existingIds.has(`${r.tmdbId}::${watchedAtFor(r)}`)).length;
  const unmatchedCount = results.filter(r => r.status === 'unmatched').length;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem 1rem 6rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => step > 1 && step < 5 ? setStep(s => s - 1) : navigate('/settings')}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
          aria-label="Back"
        >
          <BackIcon />
        </button>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 400, fontFamily: 'var(--font-serif)', letterSpacing: '-0.05em', color: 'var(--text-primary)', margin: 0 }}>
          Import Watch History
        </h1>
      </div>

      {/* Step indicators */}
      {step < 5 && (
        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.75rem' }}>
          {[1,2,3,4].map(s => (
            <div key={s} style={{
              height: 3, flex: 1, borderRadius: 99,
              background: s <= step ? 'var(--accent)' : 'var(--surface-raised)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      )}

      {/* ── Step 1: Pick platform ── */}
      {step === 1 && (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Choose the streaming service you want to import from.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPlatform(p); setStep(2); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--border)', background: 'var(--surface-raised)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <PlatformIcon id={p.id} logoPath={providerLogos[p.id]} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{p.format} export</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Step 2: Upload file ── */}
      {step === 2 && platform && (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.5rem' }}>
            <PlatformIcon id={platform.id} logoPath={providerLogos[platform.id]} size={32} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{platform.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Drop your viewing history</div>
            </div>
          </div>

          {parseError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.75rem', fontSize: '0.82rem', color: '#ef4444', marginBottom: '1rem' }}>
              {parseError}
            </div>
          )}

          {/* Drag-and-drop zone */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute('data-drag', 'true'); }}
            onDragLeave={e => e.currentTarget.removeAttribute('data-drag')}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.removeAttribute('data-drag');
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            style={{
              border: '1.5px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '2.5rem 1rem',
              textAlign: 'center',
              background: 'var(--surface)',
              cursor: 'pointer',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--surface-raised)', border: '1.5px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 0.85rem',
              color: 'var(--text-muted)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
              Drop your {platform.format} here
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>
              {platform.id === 'netflix' ? 'NetflixViewingHistory.csv' : platform.id === 'letterboxd' ? 'diary.csv' : `Your ${platform.name} export file`}
            </div>
            <span style={{
              fontSize: '0.78rem', fontWeight: 600,
              color: 'var(--accent)',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              or browse files
            </span>
          </div>

          {/* Condensed instructions */}
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              How to export from {platform.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {platform.shortInstructions.split(' → ').map((part, i) => (
                <span key={i}>
                  {i > 0 && <span style={{ opacity: 0.4 }}> → </span>}
                  {part}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Step 3: Resolving ── */}
      {step === 3 && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <LoadingSpinner />
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1.25rem' }}>
            Matching titles…
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {resolveProgress.done} / {resolveProgress.total}
          </div>
          <div style={{ height: 4, background: 'var(--surface-raised)', borderRadius: 99, marginTop: '1rem' }}>
            <div style={{
              height: '100%', borderRadius: 99, background: 'var(--accent)',
              width: `${resolveProgress.total ? (resolveProgress.done / resolveProgress.total) * 100 : 0}%`,
              transition: 'width 0.2s',
            }} />
          </div>
        </div>
      )}

      {/* ── Step 4: Preview ── */}
      {step === 4 && (
        <>
          {/* Editorial headline */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.25, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Found <span style={{ color: 'var(--accent)' }}>{newCount + alreadyCount + unmatchedCount} title{newCount + alreadyCount + unmatchedCount !== 1 ? 's' : ''}</span> from {platform?.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {alreadyCount > 0 && unmatchedCount > 0
                ? `${alreadyCount} already in history · ${unmatchedCount} unmatched`
                : alreadyCount > 0
                  ? `${alreadyCount} already in your history`
                  : unmatchedCount > 0
                    ? `${unmatchedCount} couldn't be matched`
                    : 'None already in your history'}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border)', marginBottom: '0.75rem' }} />

          {/* Results list */}
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem', maxHeight: '52vh', overflowY: 'auto' }}>
            {results.map((r, i) => {
              const alreadyHave = r.status === 'matched' && existingIds.has(`${r.tmdbId}::${watchedAtFor(r)}`);
              const unmatched = r.status === 'unmatched';
              const isNew = !alreadyHave && !unmatched;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.65rem 0',
                  borderBottom: '1px solid var(--border)',
                  opacity: alreadyHave || unmatched ? 0.45 : 1,
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                  <PosterThumb path={r.posterPath} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.status === 'matched' ? r.tmdbTitle : r.title}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {unmatched ? 'Not matched' : alreadyHave ? 'Already in history' : r.mediaType === 'tv' ? 'TV Series' : 'Movie'}
                      {r.date ? ` · ${r.date}` : ''}
                    </div>
                  </div>
                  {isNew && (
                    <div style={{
                      fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.05em',
                      padding: '0.2rem 0.45rem', borderRadius: 99,
                      textTransform: 'uppercase', flexShrink: 0,
                      background: 'rgba(224,90,122,0.12)', color: 'var(--accent)',
                      border: '1px solid rgba(224,90,122,0.25)',
                    }}>New</div>
                  )}
                  {alreadyHave && (
                    <div style={{
                      fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.05em',
                      padding: '0.2rem 0.45rem', borderRadius: 99,
                      textTransform: 'uppercase', flexShrink: 0,
                      background: 'rgba(74,222,128,0.08)', color: '#4ade80',
                      border: '1px solid rgba(74,222,128,0.2)',
                    }}>Have</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {newCount} new{alreadyCount > 0 ? ` · ${alreadyCount} skipped` : ''}{unmatchedCount > 0 ? ` · ${unmatchedCount} unmatched` : ''}
            </div>
            <button
              onClick={handleImport}
              disabled={importing || newCount === 0}
              style={{
                padding: '0.7rem 1.5rem', borderRadius: 99,
                background: newCount === 0 ? 'var(--surface-raised)' : '#fff',
                color: newCount === 0 ? 'var(--text-muted)' : '#000',
                fontWeight: 700, fontSize: '0.85rem', border: 'none',
                cursor: newCount === 0 ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              {importing ? 'Importing…' : newCount === 0 ? 'Nothing new' : `Import →`}
            </button>
          </div>
        </>
      )}

      {/* ── Step 5: Done ── */}
      {step === 5 && (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div style={{ color: 'var(--accent)', marginBottom: '1rem' }}>
            <CheckIcon />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            {importedCount} title{importedCount !== 1 ? 's' : ''} added
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Your watch history has been imported to PLOT.
          </div>
          <button
            onClick={() => navigate('/history')}
            style={{
              padding: '0.75rem 2rem', borderRadius: 'var(--radius-lg)',
              background: 'var(--accent)', color: '#fff',
              fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer',
            }}
          >
            View History
          </button>
        </div>
      )}
    </div>
  );
}
