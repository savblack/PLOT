import { useEffect, useState } from 'react';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { loadCertificationMeaning, movieGuide, tvGuide } from '@plot/core/parentalGuide.js';
import { regionName } from '@plot/core/regions.js';
import { getTmdbRegion, tmdb } from '@plot/core/tmdb.js';
import './ParentalGuide.css';

/**
 * Regional rating under the title facts. Advisories open on the rating.
 * Signed-in members can hide it. The preference lives on the profile because
 * the settings screens are in other open pulls.
 */
export default function ParentalGuide({ mediaType, tmdbId, details, signedIn, hidden, onSetShown }) {
  const region = getTmdbRegion();
  const [ratings, setRatings] = useState(null);
  const [meaning, setMeaning] = useState(null);
  const [open, setOpen] = useState(false);
  const [seenHidden, setSeenHidden] = useState(hidden);
  const [shown, setShown] = useState(!hidden);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  if (seenHidden !== hidden) {
    setSeenHidden(hidden);
    setShown(!hidden);
  }

  useEffect(() => {
    if (mediaType !== 'tv' || tmdbId == null) return undefined;
    let cancelled = false;
    tmdb.contentRatings(tmdbId).then(data => { if (!cancelled) setRatings(data); });
    return () => { cancelled = true; };
  }, [mediaType, tmdbId]);

  const guide = mediaType === 'tv'
    ? tvGuide(ratings, region)
    : movieGuide(details?.release_dates, region);
  const certification = guide?.certification ?? null;

  useEffect(() => {
    if (!certification) return undefined;
    let cancelled = false;
    loadCertificationMeaning(tmdb, mediaType, region, certification).then(text => {
      if (!cancelled) setMeaning(text);
    });
    return () => { cancelled = true; };
  }, [mediaType, region, certification]);

  async function setPreference(next) {
    if (!signedIn || saving) return;
    setSaving(true);
    setError(false);
    setShown(next);
    const ok = await onSetShown(next);
    if (!ok) {
      setShown(!next);
      setError(true);
    }
    setSaving(false);
  }

  if (!shown) {
    if (!signedIn) return null;
    return (
      <div className="parental-guide">
        <button type="button" className="parental-guide-show" onClick={() => setPreference(true)}>
          {MEDIA_PANEL.showParentalGuide}
        </button>
        {error && <p className="parental-guide-error">{MEDIA_PANEL.couldNotUpdateParentalGuide}</p>}
      </div>
    );
  }

  if (!guide) return null;

  const descriptors = guide.descriptors.join(', ');
  return (
    <div className="parental-guide">
      <button
        type="button"
        className="parental-guide-rating"
        aria-expanded={open}
        aria-label={`${guide.certification}. ${MEDIA_PANEL.parentalGuide}`}
        onClick={() => setOpen(value => !value)}
      >
        {guide.certification}
      </button>
      {open && (
        <div className="parental-guide-body">
          <p className="parental-guide-region">{regionName(region)}</p>
          {meaning && <p className="parental-guide-meaning">{meaning}</p>}
          {descriptors && <p className="parental-guide-descriptors">{descriptors}</p>}
          {signedIn && (
            <button type="button" className="parental-guide-hide" onClick={() => setPreference(false)}>
              {MEDIA_PANEL.hideParentalGuide}
            </button>
          )}
        </div>
      )}
      {error && <p className="parental-guide-error">{MEDIA_PANEL.couldNotUpdateParentalGuide}</p>}
    </div>
  );
}
