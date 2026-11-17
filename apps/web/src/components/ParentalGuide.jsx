import { Fragment, useEffect, useState } from 'react';
import { movieGuide, tvGuide } from '@plot/core/parentalGuide.js';
import { getTmdbRegion, tmdb } from '@plot/core/tmdb.js';
import './ParentalGuide.css';

/**
 * The title's facts line, with the regional rating on it: "2024 · 3 seasons ·
 * MA 15+". The line renders with or without a rating, so the panel has one
 * facts line whether the rating is loading or missing.
 * The rating is a label and nothing else: no meaning, no advisories, and no
 * control to hide or show it.
 */
export default function ParentalGuide({ mediaType, tmdbId, details, facts = [] }) {
  const region = getTmdbRegion();
  const [ratings, setRatings] = useState(null);

  useEffect(() => {
    if (mediaType !== 'tv' || tmdbId == null) return undefined;
    let cancelled = false;
    tmdb.contentRatings(tmdbId).then(data => { if (!cancelled) setRatings(data); });
    return () => { cancelled = true; };
  }, [mediaType, tmdbId]);

  const guide = mediaType === 'tv'
    ? tvGuide(ratings, region)
    : movieGuide(details?.release_dates, region);

  const lead = facts.filter(Boolean).join(' · ');
  const rating = guide ? <span className="parental-guide-rating">{guide.certification}</span> : null;
  const parts = [lead, rating].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="panel-facts">
      {parts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{part}</Fragment>)}
    </p>
  );
}
