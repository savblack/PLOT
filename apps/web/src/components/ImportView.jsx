import { readImportSelection } from '@plot/core/importArchive.js';
import { getConfig } from '@plot/core/config.js';
import { needsDuplicateReview, alreadyImportedEvent, reviewPendingWatchSummaries } from '@plot/core/importEvents.js';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { tmdb } from '@plot/core/tmdb.js';
import { importReportMessages, importListSelections, importListResultMessage } from '@plot/core/importDocument.js';
import { planHistoryImport } from '@plot/core/importPlan.js';
import {
  resolveImportEntries, readExistingHistory, buildImportRows, writeImportDocument, resolveImportMatch, reviewImportDuplicates,
} from '@plot/core/importPipeline.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { track, EVENTS } from '../lib/analytics.js';
import { MEDIA } from '../copy/media.js';
import { IMPORT_VIEW } from '../copy/importView.js';

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
  { id: 'tvtime', name: IMPORT_VIEW.tvTimeName, color: '#666', format: 'JSON', shortInstructions: IMPORT_VIEW.tvTimeHint, instructions: [IMPORT_VIEW.tvTimeHint] },
  { id: 'trakt', name: IMPORT_VIEW.traktName, color: '#666', format: 'JSON', get shortInstructions() { return IMPORT_VIEW.traktHint(getConfig().importAnnotationsEnabled); }, get instructions() { return [this.shortInstructions]; } },
  { id: 'imdb', name: IMPORT_VIEW.imdbName, color: '#666', format: 'CSV', shortInstructions: IMPORT_VIEW.imdbHint, instructions: [IMPORT_VIEW.imdbHint] },
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
    get shortInstructions() { return IMPORT_VIEW.letterboxdHint(getConfig().importAnnotationsEnabled); },
    get instructions() { return [this.shortInstructions]; },
  },
];

/* Platform parsers (parseNetflix/Prime/Disney/Max/Apple/Letterboxd + parsePlatform)
   now live in the shared core: @plot/core/importParsing.js. */

/* TMDB resolution, the existing-history read, row building and the batched
   write all live in @plot/core/importPipeline.js, so mobile runs the same
   rules. Only the step machine and the preview UI are web's. */

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
  const { user } = useApp();
  // A file and its confirmed matches belong only to the account that chose it.
  return <AccountImportView key={user?.id || 'signed-out'} />;
}

function AccountImportView() {
  const { user } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1=platform 2=file 3=resolving 4=preview 5=done
  const [platform, setPlatform] = useState(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [parseError, setParseError] = useState('');
  const [listResult, setListResult] = useState('');
  const [documentReport, setDocumentReport] = useState([]);
  const [resolveProgress, setResolveProgress] = useState({ done: 0, total: 0 });
  const [rawResults, setResults] = useState([]);
  const results = useMemo(() => reviewPendingWatchSummaries(rawResults), [rawResults]);
  const [existingRows, setExistingRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [resolvingMatch, setResolvingMatch] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState({ duplicates: 0, failed: 0 });
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
  const handleFile = useCallback(async (files) => {
    setParseError('');
    setPreviewPage(0);
    setDocumentReport([]);
    let parsed;
    try {
      const document = await readImportSelection(platform.id, Array.from(files));
      parsed = document.entries;
      setDocumentReport(importReportMessages(document));
      if (!parsed.length && (document.warnings.length || document.notImported.length)) { setResults([]); setStep(4); return; }
    } catch (e) {
      setParseError(`Couldn't parse this file. Make sure you selected the right platform and the file is unmodified. (${e.message})`);
      return;
    }
    if (parsed.some(row => row.destination) && !getConfig().importEventsEnabled) { setParseError(IMPORT_VIEW.listNotImported('not_available')); return; }
    if (!parsed.length) {
      setParseError("No watch history found in this file. Check you exported from the right platform.");
      return;
    }

    const deduped = parsed;
    track(EVENTS.IMPORT_STARTED, { source: platform.id, count: deduped.length });

    setStep(3);
    setResolveProgress({ done: 0, total: deduped.length });

    const resolved = await resolveImportEntries(deduped, {
      search: (title) => tmdb.search(title),
      findByImdbId: id => tmdb.findByImdbId(id),
      findByTvdbId: id => tmdb.findByTvdbId(id),
      getSeason: (id, season) => tmdb.getSeason(id, season),
      onProgress: (done, total) => setResolveProgress({ done, total }),
    });

    const { rows: existing, error: existingError } = await readExistingHistory({
      userId: user.id,
      tmdbIds: resolved.flatMap(r => (r.candidates || []).map(c => c.id)),
    });

    // A partial read would make the planner treat rows already in history as
    // new, and the write would overwrite their rating and note. Stop instead.
    if (existingError) {
      setImportError(IMPORT_VIEW.couldNotReadHistory);
      setStep(2);
      return;
    }

    const review = await reviewImportDuplicates({ userId: user.id, resolved });
    if (review.error) { setImportError(IMPORT_VIEW.couldNotReadHistory); setStep(2); return; }
    setExistingRows(resolved[0]?.destination ? [] : existing);
    setResults(review.resolved);
    setStep(4);
  }, [platform, user]);

  /* One plan, used for both the preview and the write, so what the preview
     promises is exactly what gets imported. */
  const candidates = useMemo(
    () => (user ? buildImportRows({ userId: user.id, resolved: results }) : []),
    [results, user],
  );

  const plan = useMemo(
    () => planHistoryImport({ rows: candidates.map(c => c.row), existing: existingRows }),
    [candidates, existingRows],
  );

  const handleMatch = async (index, candidateKey) => {
    setResolvingMatch(true);
    try {
      const resolved = await resolveImportMatch(results[index], candidateKey, {
        getSeason: (id, season) => tmdb.getSeason(id, season),
      });
      setResults(current => current.map((entry, i) => i === index ? resolved : entry));
    } finally {
      setResolvingMatch(false);
    }
  };

  /* Row identity is preserved through the planner, so the preview can mark each
     result by whether its own row survived planning. */
  const plannedRows = useMemo(() => new Set(plan.rows), [plan]);
  const rowByIndex = useMemo(() => new Map(candidates.map(c => [c.index, c.row])), [candidates]);

  /* Step 4 → 5 */
  const handleImport = useCallback(async () => {
    if (resolvingMatch || results.some(needsDuplicateReview)) return;
    setImporting(true);
    setImportError('');

    // writeImportRows batches, counts failures rather than swallowing them, and
    // signals the history change on the core bus.
    const outcome = await writeImportDocument({ userId: user.id, resolved: results, summaryRows: plan.rows });
    const { inserted, failed, duplicates } = outcome;
    setListResult(importListResultMessage(outcome));
    track(EVENTS.IMPORT_COMPLETED, { source: platform?.id, count: inserted });
    setImportedCount(inserted);
    setImportResult({ duplicates, failed });
    if (failed) setImportError(IMPORT_VIEW.partialFailure(failed));
    setImporting(false);
    setStep(5);
  }, [plan, platform?.id, user, results, resolvingMatch]);

  const newCount       = getConfig().importEventsEnabled ? results.filter(r => r.status === 'matched' && r.listSelected !== false && !alreadyImportedEvent(r)).length : plan.rows.length;
  const alreadyCount   = results[0]?.destination ? 0 : getConfig().importEventsEnabled ? results.filter(alreadyImportedEvent).length : plan.alreadyInHistory;
  const unmatchedCount = results.filter(r => r.status === 'unmatched').length;
  const matchedCount   = results.filter(r => r.status === 'matched' && r.listSelected !== false).length;
  const canConfirm = getConfig().importEventsEnabled ? matchedCount > 0 : newCount > 0;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem 1rem 6rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => step > 1 && step < 5 ? setStep(s => s - 1) : navigate('/settings')}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
          aria-label="Back"
          disabled={resolvingMatch || importing}
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

      {(step === 4 || step === 5) && documentReport.length > 0 && <section aria-label={IMPORT_VIEW.reportHeading}><h2>{IMPORT_VIEW.reportHeading}</h2><ul>{documentReport.map((message, index) => <li key={index}>{message}</li>)}</ul></section>}
      {/* ── Step 1: Pick platform ── */}
      {step === 1 && (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Choose the streaming service you want to import from.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {PLATFORMS.filter(p => p.id === 'tvtime' ? getConfig().importEventsEnabled && getConfig().tvTimeImportEnabled : !['imdb', 'trakt'].includes(p.id) || getConfig().importEventsEnabled).map(p => (
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
            accept={['tvtime', 'trakt', 'letterboxd'].includes(platform.id) ? '.csv,.json,.zip' : '.csv,.json'}
            multiple={['tvtime', 'trakt', 'letterboxd'].includes(platform.id)}
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files)}
          />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute('data-drag', 'true'); }}
            onDragLeave={e => e.currentTarget.removeAttribute('data-drag')}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.removeAttribute('data-drag');
              const files = e.dataTransfer.files;
              if (files?.length) handleFile(files);
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
          {importListSelections(results).map(list => <div key={list.destination.key}><p>{IMPORT_VIEW.listPreview(list.destination)}</p><label><input type="checkbox" checked={list.listSelected !== false} onChange={e => setResults(rows => rows.map(row => row.destination?.key === list.destination.key ? { ...row, listSelected: e.target.checked } : row))} />{IMPORT_VIEW.selectList}</label></div>)}
          {/* Editorial headline */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.25, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Found <span style={{ color: 'var(--accent)' }}>{results.length} title{results.length !== 1 ? 's' : ''}</span> from {platform?.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {results.some(row => row.annotation) ? IMPORT_VIEW.annotationCounts(alreadyCount, unmatchedCount) : alreadyCount > 0 && unmatchedCount > 0
                ? `${alreadyCount} already in history · ${unmatchedCount} unmatched`
                : alreadyCount > 0
                  ? `${alreadyCount} already in your history`
                  : unmatchedCount > 0
                    ? `${unmatchedCount} couldn't be matched`
                    : IMPORT_VIEW.noneAlreadyInHistory}
            </div>
          </div>

          {getConfig().importEventsEnabled && results.some(row => !row.destination && !row.annotation) && <p>{IMPORT_VIEW.eventPreview}</p>}
          {results.some(row => row.annotation) && <p>{IMPORT_VIEW.annotationPreview}</p>}
          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border)', marginBottom: '0.75rem' }} />

          {results.length > 100 && <nav aria-label={IMPORT_VIEW.chooseMatch} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <button disabled={previewPage === 0} onClick={() => setPreviewPage(page => page - 1)}>{IMPORT_VIEW.previousEntries}</button>
            <span>{IMPORT_VIEW.previewRange(previewPage * 100 + 1, Math.min((previewPage + 1) * 100, results.length), results.length)}</span>
            <button disabled={(previewPage + 1) * 100 >= results.length} onClick={() => setPreviewPage(page => page + 1)}>{IMPORT_VIEW.nextEntries}</button>
          </nav>}
          {/* Results list */}
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem', maxHeight: '52vh', overflowY: 'auto' }}>
            {results.slice(previewPage * 100, (previewPage + 1) * 100).map((r, offset) => {
              const i = previewPage * 100 + offset;
              const unmatched = r.status === 'unmatched';
              const isNew = !unmatched && (getConfig().importEventsEnabled ? !alreadyImportedEvent(r) : plannedRows.has(rowByIndex.get(i)));
              // Matched but not planned: either the user already has this
              // title, or it merged into another entry for the same title — a
              // Netflix export lists one row per episode, so a night of one
              // series arrives as several rows describing one title.
              const alreadyHave = !unmatched && !isNew;
              const merged = !getConfig().importEventsEnabled && alreadyHave && !existingRows.some(
                e => e.tmdb_id === r.tmdbId && e.media_type === r.mediaType);
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
                      {unmatched ? IMPORT_VIEW.notMatched : merged ? IMPORT_VIEW.mergedIntoOneEntry : alreadyHave ? (r.annotation ? IMPORT_VIEW.annotationAlreadySaved : IMPORT_VIEW.alreadyInHistory) : r.mediaType === 'tv' ? MEDIA.tvSeries : MEDIA.movie}
                      {!r.annotation && r.episodeNumber != null && ` · ${IMPORT_VIEW.episodeLabel(r.seasonNumber, r.episodeNumber)}`}
                      {r.annotation ? ` · ${IMPORT_VIEW.annotationLabel(r)}` : r.date ? ` · ${r.date}` : ` · ${IMPORT_VIEW.unknownDate}`}
                    </div>
                    {r.reason === 'episode_identity_required' && <p>{IMPORT_VIEW.episodeIdentityRequired}</p>}
                    {needsDuplicateReview(r) && <div>
                      <p>{r.pendingDuplicates?.length ? IMPORT_VIEW.pendingWatchSummary : IMPORT_VIEW.possibleDuplicate}</p>
                      <button onClick={() => setResults(current => current.map((entry, index) => index === i ? { ...entry, duplicateDecision: 'keep' } : entry))}>{IMPORT_VIEW.keepSeparateWatch}</button>
                    </div>}
                    {r.duplicateDecision === 'keep' && <p>{IMPORT_VIEW.duplicateConfirmed}</p>}
                    {!!r.candidates?.length && (
                      <select aria-label={`${IMPORT_VIEW.chooseMatch}: ${r.title}`}
                        aria-busy={resolvingMatch}
                        value={r.status === 'matched' ? `${r.mediaType}:${r.tmdbId}` : ''}
                        disabled={resolvingMatch || importing}
                        onChange={event => handleMatch(i, event.target.value)}
                        style={{ maxWidth: '100%', marginTop: '0.4rem', color: 'var(--text-primary)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <option value="">{IMPORT_VIEW.skipMatch}</option>
                        {r.candidates.map(candidate => <option key={`${candidate.media_type}:${candidate.id}`} value={`${candidate.media_type}:${candidate.id}`}>
                          {IMPORT_VIEW.matchOption(candidate.title || candidate.name, (candidate.release_date || candidate.first_air_date || '').slice(0, 4), candidate.media_type)}
                        </option>)}
                      </select>
                    )}
                    {r.reason === 'search_failed' && <div role="alert">{IMPORT_VIEW.searchFailed}</div>}
                  </div>
                  {isNew && (
                    <div style={{
                      fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.05em',
                      padding: '0.2rem 0.45rem', borderRadius: 99,
                      textTransform: 'uppercase', flexShrink: 0,
                      background: 'rgba(224,90,122,0.12)', color: 'var(--accent)',
                      border: '1px solid rgba(224,90,122,0.25)',
                    }}>{IMPORT_VIEW.newBadge}</div>
                  )}
                  {alreadyHave && (
                    <div style={{
                      fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.05em',
                      padding: '0.2rem 0.45rem', borderRadius: 99,
                      textTransform: 'uppercase', flexShrink: 0,
                      background: 'var(--success-dim)', color: 'var(--success)',
                      border: '1px solid var(--success-border)',
                    }}>{IMPORT_VIEW.haveBadge}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {newCount} new{matchedCount - newCount > 0 ? ` · ${matchedCount - newCount} skipped` : ''}{unmatchedCount > 0 ? ` · ${unmatchedCount} unmatched` : ''}
            </div>
            <button
              onClick={handleImport}
              disabled={resolvingMatch || importing || !canConfirm || results.some(needsDuplicateReview)}
              style={{
                padding: '0.7rem 1.5rem', borderRadius: 99,
                background: !canConfirm ? 'var(--surface-raised)' : '#fff',
                color: !canConfirm ? 'var(--text-muted)' : '#000',
                fontWeight: 700, fontSize: '0.85rem', border: 'none',
                cursor: !canConfirm ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              {importing ? IMPORT_VIEW.importing : !canConfirm ? IMPORT_VIEW.nothingNew : IMPORT_VIEW.importArrow}
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
            {IMPORT_VIEW.resultSummary(importedCount, importResult.duplicates, importResult.failed, unmatchedCount)}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: importError ? '1rem' : '2rem' }}>
            {importResult.failed ? IMPORT_VIEW.incomplete : IMPORT_VIEW.finished}
          </div>
          {listResult && <p role="status">{listResult}</p>}
          {importError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.75rem', fontSize: '0.8rem', color: '#ef4444', marginBottom: '2rem', textAlign: 'left' }}>
              {importError}
            </div>
          )}
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
