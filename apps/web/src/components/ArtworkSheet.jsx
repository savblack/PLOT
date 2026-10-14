// The customize control and the sheet. Web renders it. The groups and the
// save rules live in @plot/core so mobile shows the same choices.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadArtworkCatalog } from '@plot/core/artwork.js';
import { ARTWORK } from '@plot/core/copy/artwork.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { tmdb } from '@plot/core/tmdb.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useApp } from '../hooks/useApp.js';
import { backdropUrl, logoUrl, posterUrl, profileUrl } from '../utils/images.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import './ArtworkSheet.css';

function tileUrl(kind, path) {
  if (!path) return null;
  if (kind === 'backdrop') return backdropUrl(path, 'w300');
  if (kind === 'logo') return logoUrl(path, 'w300');
  if (kind === 'profile') return profileUrl(path, 'w185');
  return posterUrl(path, 'w185');
}

function sectionTitle(section) {
  return section.labelKey === 'seasonPosters' ? ARTWORK.seasonPosters(section.seasonNumber) : ARTWORK[section.labelKey];
}

function fallbackPath(section, defaults) {
  if (section.kind === 'profile') return defaults.profile || null;
  if (section.kind === 'backdrop') return defaults.backdrop || null;
  if (section.kind === 'logo') return null;
  return defaults.poster || null;
}

export default function CustomizeArtwork({ mediaType, tmdbId, seasonNumber, defaults = {} }) {
  const { user, profile } = useApp();
  const art = useUserArtwork();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadArtworkCatalog(tmdb, { mediaType, tmdbId, seasonNumber }).then(result => {
      if (cancelled) return;
      setSections(result.sections);
      setFailed(result.failed);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, mediaType, tmdbId, seasonNumber]);

  if (!user || !tmdbId) return null;

  const choose = async (section, filePath) => {
    if (busy) return;
    setBusy(true);
    const choice = {
      subjectType: section.subjectType,
      tmdbId: section.tmdbId,
      seasonNumber: section.seasonNumber,
      kind: section.kind,
    };
    const ok = filePath ? await art.save({ ...choice, filePath }) : await art.clear(choice);
    setBusy(false);
    if (!ok) return;
  };

  return (
    <>
      <button
        type="button"
        className="panel-artwork-btn"
        onClick={() => {
          if (!isPremiumProfile(profile)) {
            navigate(premiumPlansPath(`${location.pathname}${location.search}`));
            return;
          }
          setOpen(true);
        }}
      >
        {ARTWORK.customize}
      </button>
      {open && (
        <ResponsiveDialog title={ARTWORK.customize} onClose={() => setOpen(false)} zIndex={1100} tall>
          <div className="artwork-sheet">
            {art.error && <p className="artwork-sheet-note" role="alert">{art.error}</p>}
            {loading ? <LoadingSpinner /> : failed ? (
              <p className="artwork-sheet-note" role="alert">{ARTWORK.couldNotLoad}</p>
            ) : sections.map(section => {
              const saved = art.path(section.subjectType, section.tmdbId, section.kind, section.seasonNumber);
              const fallback = fallbackPath(section, defaults);
              const title = sectionTitle(section);
              const wide = section.kind === 'backdrop' || section.kind === 'logo';
              return (
                <section key={section.key} aria-label={title}>
                  <h3 className="artwork-section-title">{title}</h3>
                  <div className="artwork-row">
                    <button
                      type="button"
                      className={`artwork-tile${wide ? ' artwork-tile--wide' : ''}${section.kind === 'logo' ? ' artwork-tile--logo' : ''}${saved ? '' : ' artwork-tile--selected'}`}
                      aria-pressed={!saved}
                      disabled={busy}
                      onClick={() => choose(section, null)}
                    >
                      {tileUrl(section.kind, fallback)
                        ? <img src={tileUrl(section.kind, fallback)} alt="" />
                        : <span className="artwork-tile-empty" aria-hidden="true" />}
                      <span>{ARTWORK.useDefault}</span>
                    </button>
                    {section.options.map(option => (
                      <button
                        type="button"
                        key={option.file_path}
                        className={`artwork-tile${wide ? ' artwork-tile--wide' : ''}${section.kind === 'logo' ? ' artwork-tile--logo' : ''}${saved === option.file_path ? ' artwork-tile--selected' : ''}`}
                        aria-pressed={saved === option.file_path}
                        disabled={busy}
                        onClick={() => choose(section, option.file_path)}
                      >
                        <img src={tileUrl(section.kind, option.file_path)} alt="" />
                      </button>
                    ))}
                  </div>
                  {section.options.length === 0 && <p className="artwork-sheet-empty">{ARTWORK.empty}</p>}
                </section>
              );
            })}
          </div>
        </ResponsiveDialog>
      )}
    </>
  );
}
