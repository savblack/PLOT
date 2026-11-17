import { Fragment, useEffect, useState } from 'react';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { movieGuide, tvGuide } from '@plot/core/parentalGuide.js';
import { getTmdbRegion, tmdb } from '@plot/core/tmdb.js';
import './ParentalGuide.css';

/**
 * The title's facts line, with the regional rating on it: "2024 · 3 seasons ·
 * MA 15+". The line renders with or without a rating, so the panel has one
 * facts line whether the rating is loading, missing or hidden.
 * The rating is a label only: no meaning or advisories. For a signed-in
 * member it is also the control that offers Hide. The preference lives on the
 * profile because the settings screens are in other open pulls.
 */
export default function ParentalGuide({ mediaType, tmdbId, details, signedIn, hidden, onSetShown, facts = [] }) {
  const region = getTmdbRegion();
  const [ratings, setRatings] = useState(null);
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

  const lead = facts.filter(Boolean).join(' · ');
  const factsLine = (rating) => {
    const parts = [lead, rating].filter(Boolean);
    if (!parts.length) return null;
    return (
      <p className="panel-facts">
        {parts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{part}</Fragment>)}
      </p>
    );
  };

  if (!shown) {
    if (!signedIn) return factsLine(null);
    return (
      <>
        {factsLine(null)}
        <div className="parental-guide">
          <button type="button" className="parental-guide-show" onClick={() => setPreference(true)}>
            {MEDIA_PANEL.showParentalGuide}
          </button>
          {error && <p className="parental-guide-error">{MEDIA_PANEL.couldNotUpdateParentalGuide}</p>}
        </div>
      </>
    );
  }

  if (!guide) return factsLine(null);

  return (
    <>
      {factsLine(signedIn ? (
        <button
          type="button"
          className="parental-guide-rating"
          aria-expanded={open}
          aria-label={`${guide.certification}. ${MEDIA_PANEL.parentalGuide}`}
          onClick={() => setOpen(value => !value)}
        >
          {guide.certification}
        </button>
      ) : <span className="parental-guide-rating parental-guide-rating--static">{guide.certification}</span>)}
      {(open || error) && (
        <div className="parental-guide">
          {open && (
            <button
              type="button"
              className="parental-guide-hide"
              aria-label={`${MEDIA_PANEL.hideParentalGuide} ${MEDIA_PANEL.parentalGuide}`}
              onClick={() => setPreference(false)}
            >
              {MEDIA_PANEL.hideParentalGuide}
            </button>
          )}
          {error && <p className="parental-guide-error">{MEDIA_PANEL.couldNotUpdateParentalGuide}</p>}
        </div>
      )}
    </>
  );
}
