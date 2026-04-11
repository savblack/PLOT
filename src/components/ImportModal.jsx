import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../api/supabase';
import { tmdb } from '../api/tmdb';
import { detectFormat, parseNetflix, parseLetterboxd } from '../utils/importParsers';
import './ImportModal.css';
import { usePostHog } from '@posthog/react';

const BATCH_SIZE = 10;

async function matchToTMDB(entries, format, onProgress) {
  const matched = [];
  const unmatched = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (entry) => {
      try {
        let query = entry.title;
        if (format === 'letterboxd' && entry.year) query = `${entry.title} ${entry.year}`;

        const data = await tmdb.search(query);
        if (!data?.results?.length) {
          unmatched.push({ original_title: entry.title });
          return;
        }

        let result;
        if (format === 'netflix' && entry.media_type_hint === 'tv') {
          result = data.results.find(r => r.media_type === 'tv') || data.results[0];
        } else if (format === 'letterboxd') {
          result = data.results.find(r =>
            r.media_type === 'movie' &&
            entry.year &&
            (r.release_date || '').startsWith(String(entry.year))
          ) || data.results.find(r => r.media_type === 'movie') || data.results[0];
        } else {
          result = data.results[0];
        }

        if (!result || (result.media_type !== 'movie' && result.media_type !== 'tv')) {
          unmatched.push({ original_title: entry.title });
          return;
        }

        matched.push({
          tmdb_id: result.id,
          title: result.title || result.name,
          poster_path: result.poster_path || null,
          media_type: result.media_type,
          watched_at: entry.watched_at || null,
          rating: entry.rating || null,
        });
      } catch {
        unmatched.push({ original_title: entry.title });
      }
    }));
    onProgress(Math.min(i + BATCH_SIZE, entries.length), entries.length);
  }

  // Deduplicate matched by tmdb_id — keep first occurrence
  const seen = new Set();
  const deduped = matched.filter(m => {
    if (seen.has(m.tmdb_id)) return false;
    seen.add(m.tmdb_id);
    return true;
  });

  return { matched: deduped, unmatched };
}

export default function ImportModal({ user, onClose, onImported }) {
  const posthog = usePostHog();
  const [step, setStep] = useState('upload'); // upload | matching | preview | done
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [importCount, setImportCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    setError('');
    if (!file || !file.name.endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }

    const text = await file.text();
    const firstLine = text.split('\n')[0] || '';
    const headers = firstLine.split(',').map(h => h.replace(/"/g, '').trim());
    const format = detectFormat(headers);

    if (!format) {
      setError('Unrecognised CSV format. Please upload a Netflix or Letterboxd export.');
      return;
    }

    let entries;
    try {
      entries = format === 'netflix' ? parseNetflix(text) : parseLetterboxd(text);
    } catch {
      setError('Failed to parse CSV. The file may be corrupted.');
      return;
    }

    if (entries.length === 0) {
      setError('No entries found in this file.');
      return;
    }

    setStep('matching');
    setProgress({ done: 0, total: entries.length });

    const result = await matchToTMDB(entries, format, (done, total) => {
      setProgress({ done, total });
    });

    setMatched(result.matched);
    setUnmatched(result.unmatched);
    setSelected(new Set(result.matched.map(m => m.tmdb_id)));
    setStep('preview');
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const toggleItem = (tmdbId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!user) return;
    setImporting(true);

    const entries = matched
      .filter(m => selected.has(m.tmdb_id))
      .map(m => ({
        user_id: user.id,
        tmdb_id: m.tmdb_id,
        media_type: m.media_type,
        title: m.title,
        poster_path: m.poster_path,
        watched_at: m.watched_at || new Date().toISOString().split('T')[0],
        rating: m.rating,
      }));

    await supabase.from('journal').upsert(entries, { onConflict: 'user_id, tmdb_id' });

    posthog?.capture('import_completed', {
      imported_count: entries.length,
      unmatched_count: unmatched.length,
    });

    setImportCount(entries.length);
    setImporting(false);
    setStep('done');
    onImported?.(entries.length);
  };

  const selectedCount = selected.size;

  return createPortal(
    <div className="import-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="import-modal">
        <button className="import-modal-close" onClick={onClose} aria-label="Close">×</button>

        {step === 'upload' && (
          <div className="import-step">
            <h2 className="import-heading">Import watch history</h2>
            <p className="import-sub">Upload a CSV export from Netflix or Letterboxd.</p>

            <div
              className={`import-dropzone${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="import-dropzone-text">Drop your CSV here, or click to browse</p>
              <p className="import-dropzone-hint">Netflix · Letterboxd</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            {error && <p className="import-error">{error}</p>}

            <div className="import-format-help">
              <details>
                <summary>
                  How to export your history
                  <svg className="import-help-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </summary>
                <ul>
                  <li><strong>Netflix:</strong> Account → Order and watching history → Download all</li>
                  <li><strong>Letterboxd:</strong> Settings → Import & Export → Export your data</li>
                </ul>
              </details>
            </div>
          </div>
        )}

        {step === 'matching' && (
          <div className="import-step import-step-center">
            <div className="import-spinner" />
            <h2 className="import-heading">Matching titles…</h2>
            <p className="import-sub">
              {progress.done} / {progress.total} titles matched
            </p>
            <div className="import-progress-bar">
              <div
                className="import-progress-fill"
                style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="import-step">
            <h2 className="import-heading">
              {matched.length} title{matched.length !== 1 ? 's' : ''} matched
            </h2>
            <p className="import-sub">
              Deselect any you don't want to import.
            </p>

            <div className="import-preview-grid">
              {matched.map(item => {
                const isSelected = selected.has(item.tmdb_id);
                return (
                  <button
                    key={item.tmdb_id}
                    className={`import-preview-item${isSelected ? ' selected' : ''}`}
                    onClick={() => toggleItem(item.tmdb_id)}
                    title={item.title}
                  >
                    {item.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.title} />
                    ) : (
                      <div className="import-preview-no-poster">{item.title}</div>
                    )}
                    {isSelected && (
                      <div className="import-preview-check">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="1.5 6 4.5 9 10.5 3" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {unmatched.length > 0 && (
              <details className="import-unmatched">
                <summary>{unmatched.length} title{unmatched.length !== 1 ? 's' : ''} couldn't be matched</summary>
                <ul>
                  {unmatched.map((u, i) => <li key={i}>{u.original_title}</li>)}
                </ul>
              </details>
            )}

            <button
              className="import-cta"
              onClick={handleImport}
              disabled={selectedCount === 0 || importing}
            >
              {importing
                ? <span className="import-spinner-sm" />
                : `Import ${selectedCount} title${selectedCount !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="import-step import-step-center">
            <div className="import-done-icon">✓</div>
            <h2 className="import-heading">{importCount} title{importCount !== 1 ? 's' : ''} imported</h2>
            <p className="import-sub">They're now in your journal.</p>
            <button className="import-cta" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
