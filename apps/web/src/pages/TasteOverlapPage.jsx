import './TasteOverlapPage.css';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useTasteOverlap } from '@plot/core/useTasteOverlap.js';
import { MIN_SHARED_RATINGS } from '@plot/core/tasteOverlap.js';
import { useGenres } from '@plot/core/useGenres.js';
import { historyRatingLabel } from '@plot/core/history.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { posterUrl } from '../utils/images.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { watchTogetherPath } from '../launchFeatures.js';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import TasteShareDialog from '../components/TasteShareDialog.jsx';
import TasteShareMenu from '../components/TasteShareMenu.jsx';
import LoginRedirect from '../components/LoginRedirect.jsx';

const initialOf = (s) => (s || '?').charAt(0).toUpperCase();
const stars = (n) => (n == null ? '' : `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}`);

function Avatar({ url, name, className = '' }) {
  return url
    ? <img className={`to-avatar ${className}`} src={url} alt="" />
    : <span className={`to-avatar ${className}`} aria-hidden="true">{initialOf(name)}</span>;
}

function BackButton({ to }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="to-icon-btn" aria-label={T.back} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(to))}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  );
}

function Venn({ watched, name }) {
  return (
    <svg className="to-venn" viewBox="0 0 300 150" role="img" aria-label={T.vennLabel(watched.mine, watched.theirs, watched.both, name)}>
      <circle cx="188" cy="75" r="62" className="to-venn-theirs" />
      <circle cx="112" cy="75" r="70" className="to-venn-mine" />
      <text x="76" y="72" textAnchor="middle" className="to-venn-num">{watched.mine}</text>
      <text x="76" y="90" textAnchor="middle" className="to-venn-label">{T.you.toLowerCase()}</text>
      <text x="150" y="74" textAnchor="middle" className="to-venn-num to-venn-num--both">{watched.both}</text>
      <text x="150" y="92" textAnchor="middle" className="to-venn-label to-venn-label--both">{T.both}</text>
      <text x="222" y="72" textAnchor="middle" className="to-venn-num">{watched.theirs}</text>
      <text x="222" y="90" textAnchor="middle" className="to-venn-label">{name}</text>
    </svg>
  );
}

function Poster({ item, className }) {
  const src = posterUrl(item.poster_path, 'w185');
  return (
    <span className={className}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="to-poster-fallback">{item.title}</span>}
    </span>
  );
}

function Upsell({ from }) {
  return (
    <section className="to-card to-state">
      <h2 className="to-state-title">{T.upsellTitle}</h2>
      <p className="to-state-body">{T.upsellBody}</p>
      <Link className="btn btn-sm btn-primary" to={premiumPlansPath(from)}>{PLANS_PAGE.previewAction}</Link>
    </section>
  );
}

/**
 * The comparison itself, from already-loaded data. Split from the page so
 * Storybook can render every state without a session.
 */
export function TasteOverlapView({ username, premium, loading, error, target, overlap, sharedWatchlist, genreName, onRetry, openPanel, upsellFrom }) {
  const [sharing, setSharing] = useState(false);
  const profilePath = `/u/${username}`;
  const name = target ? (target.display_name || target.username) : `@${username}`;

  let body;
  if (!premium) {
    body = <Upsell from={upsellFrom} />;
  } else if (loading) {
    body = <div className="to-loading"><PlotLoader /></div>;
  } else if (error) {
    const message = error === 'not_visible' ? T.notVisible(name) : error === 'not_found' ? T.notFound : T.failed;
    body = (
      <section className="to-card to-state">
        <p className="to-state-body">{message}</p>
        {error === 'failed' && <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>{T.retry}</button>}
        {error === 'not_visible' && <Link className="btn btn-sm btn-secondary" to={profilePath}>{name}</Link>}
      </section>
    );
  } else if (overlap) {
    const o = overlap;
    const need = MIN_SHARED_RATINGS - o.sharedRated;
    const maxGenre = Math.max(1, ...o.genres.flatMap(g => [g.mine, g.theirs]));
    const critic = o.critic;
    body = (
      <>
        <section className="to-card to-match" aria-labelledby="to-match-kicker">
          <span className="to-kicker" id="to-match-kicker">{T.matchKicker}</span>
          {o.match != null ? (
            <>
              <span className="to-match-num">{o.match}%</span>
              <span className="to-match-note">{T.basedOn(o.sharedRated)}</span>
            </>
          ) : (
            <span className="to-match-note">{T.needMoreRatings(need)}</span>
          )}
          <Venn watched={o.watched} name={name} />
          <span className="to-caption">{T.titlesWatched}</span>
        </section>

        <section className="to-card">
          <div className="to-card-head">
            <h2 className="to-h2">{T.genres}</h2>
            <span className="to-legend">
              <span><i className="to-swatch to-swatch--mine" />{T.you}</span>
              <span><i className="to-swatch to-swatch--theirs" />{name}</span>
            </span>
          </div>
          {o.genres.length === 0 ? <p className="to-empty">{T.noGenres}</p> : (
            <ul className="to-genres">
              {o.genres.map(g => (
                <li key={g.id} className="to-genre">
                  <div className="to-genre-row">
                    <span className="to-genre-name">{genreName.get(g.id) || '…'}</span>
                    <span className="to-genre-pct">{g.mine}% · {g.theirs}%</span>
                  </div>
                  <span className="to-bar"><span className="to-bar-fill to-bar-fill--mine" style={{ width: `${(g.mine / maxGenre) * 100}%` }} /></span>
                  <span className="to-bar"><span className="to-bar-fill to-bar-fill--theirs" style={{ width: `${(g.theirs / maxGenre) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="to-pair">
          <section className="to-card to-tile">
            <span className="to-tile-label">{T.yourDecade}</span>
            <span className="to-tile-value">{o.decades.mine ? T.decade(o.decades.mine) : '–'}</span>
            <span className="to-tile-note">
              {!o.decades.mine || !o.decades.theirs ? T.noDecade
                : o.decades.mine === o.decades.theirs ? T.sameDecade(name)
                : T.theirDecade(name, o.decades.theirs)}
            </span>
          </section>
          <section className="to-card to-tile">
            <span className="to-tile-label">{T.tougherCritic}</span>
            <span className="to-tile-value">
              {critic.tougher === 'mine' ? T.you : critic.tougher === 'theirs' ? name : critic.tougher === 'even' ? T.even : '–'}
            </span>
            <span className="to-tile-note">
              {critic.tougher === 'theirs' ? T.theyAreTougher(stars(critic.theirs), stars(critic.mine))
                : critic.tougher === 'mine' ? T.youAreTougher(name, stars(critic.mine), stars(critic.theirs))
                : critic.tougher === 'even' ? T.evenCritics(stars(critic.mine))
                : T.noCritic}
            </span>
          </section>
        </div>

        <section className="to-section">
          <h2 className="to-h2">{T.bothLoved}</h2>
          {o.loved.length === 0 ? <p className="to-empty">{T.bothLovedEmpty}</p> : (
            <ul className="to-loved">
              {o.loved.map(t => (
                <li key={`${t.media_type}:${t.tmdb_id}`}>
                  <button type="button" className="to-loved-btn" onClick={() => openPanel(t.tmdb_id, t.media_type)} aria-label={t.title}>
                    <Poster item={t} className="to-loved-poster" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="to-card">
          <h2 className="to-h2">{T.disagree}</h2>
          {o.disagree.length === 0 ? <p className="to-empty">{T.disagreeEmpty}</p> : (
            <ul className="to-disagree">
              {o.disagree.map(t => (
                <li key={`${t.media_type}:${t.tmdb_id}`}>
                  <button type="button" className="to-disagree-row" onClick={() => openPanel(t.tmdb_id, t.media_type)}>
                    <Poster item={t} className="to-disagree-poster" />
                    <span className="to-disagree-title">{t.title}</span>
                    <span className="to-disagree-scores">
                      <span>{T.you} <strong>{historyRatingLabel(t.mine)}</strong></span>
                      <span>{name} <strong>{historyRatingLabel(t.theirs)}</strong></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {sharedWatchlist > 0 && (
          <Link className="to-watchlist" to={watchTogetherPath(target.username)}>
            <span className="to-watchlist-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
            </span>
            <span className="to-watchlist-text">
              <strong>{T.watchlistOverlap(sharedWatchlist)}</strong>
              <span>{T.watchTogether}</span>
            </span>
            <svg className="to-watchlist-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </Link>
        )}

        <div className="to-share-row">
          <button type="button" className="btn btn-primary" onClick={() => setSharing(true)}>{T.share}</button>
        </div>
      </>
    );
  }

  return (
    <div className="to-view">
      <div className="to-top">
        <BackButton to={profilePath} />
        <span className="to-chip">{T.premiumChip}</span>
        {premium && overlap && target
          ? <TasteShareMenu overlap={overlap} target={target} genreName={genreName} onCustomise={() => setSharing(true)} />
          : <span className="to-top-spacer" aria-hidden="true" />}
      </div>

      <header className="to-header">
        <h1 className="to-h1">{T.title}</h1>
        <Link className="to-person" to="/compare" aria-label={`${T.youAnd(name)}. ${T.changePerson}`}>
          <Avatar url={target?.avatar_url} name={name} />
          {T.youAnd(name)}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </Link>
      </header>

      {body}

      {sharing && overlap && target && (
        <TasteShareDialog overlap={overlap} target={target} genreName={genreName} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}

export default function TasteOverlapPage() {
  const { username } = useParams();
  const location = useLocation();
  const { user, profile, openPanel } = useApp();
  const premium = isPremiumProfile(profile);
  const { loading, error, target, overlap, sharedWatchlist, retry } = useTasteOverlap(username, { enabled: !!user && premium });
  const { genres } = useGenres();
  const genreName = useMemo(() => new Map(genres.map(g => [g.id, g.name])), [genres]);

  if (!user) return <LoginRedirect />;

  return (
    <TasteOverlapView
      username={username}
      premium={premium}
      loading={loading}
      error={error}
      target={target}
      overlap={overlap}
      sharedWatchlist={sharedWatchlist}
      genreName={genreName}
      onRetry={retry}
      openPanel={openPanel}
      upsellFrom={location.pathname}
    />
  );
}
