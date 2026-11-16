import './TasteOverlapPage.css';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useTasteOverlap } from '@plot/core/useTasteOverlap.js';
import { useSavedComparisons } from '@plot/core/useSavedComparisons.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { track } from '../lib/analytics.js';
import { MIN_SHARED_RATINGS } from '@plot/core/tasteOverlap.js';
import { useGenres } from '@plot/core/useGenres.js';
import { historyRatingLabel } from '@plot/core/history.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { posterUrl } from '../utils/images.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import { WATCH_TOGETHER } from '@plot/core/copy/watchTogether.js';
import TasteShareDialog from '../components/TasteShareDialog.jsx';
import TasteShareMenu from '../components/TasteShareMenu.jsx';
import LoginRedirect from '../components/LoginRedirect.jsx';
import PremiumMark from '../components/PremiumMark.jsx';
import PremiumGateButton from '../components/PremiumGateButton.jsx';
import BackLink from '../components/BackLink.jsx';
import ComparePeoplePanel from '../components/ComparePeoplePanel.jsx';
import { titleForView } from '../navigation.js';

const stars = (n) => (n == null ? '' : `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}`);


/* The shape of the page while taste_overlap is in flight: the match card and
   the genre bars, so the layout does not jump when the answer lands. The
   request crosses to the production region and back, about two seconds from
   Australia, so a lone spinner read as stuck. */
function LoadingSkeleton() {
  return (
    <div className="to-skeleton" role="status" aria-label={T.loading}>
      <section className="to-card to-match" aria-hidden="true">
        <span className="to-match-text">
          <span className="to-skel to-skel--kicker" />
          <span className="to-skel to-skel--note" />
        </span>
        <span className="to-skel-venn"><span className="to-skel to-skel--circle" /><span className="to-skel to-skel--circle" /></span>
      </section>
      <section className="to-card" aria-hidden="true">
        <span className="to-skel to-skel--title" />
        {[0, 1, 2, 3].map(i => <span key={i} className="to-skel to-skel--bar" />)}
      </section>
    </div>
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

/**
 * Watch together (PR 1039) with this person: its two-person overlap page. Only
 * linked while SHOW_WATCH_TOGETHER is on, so the row never points at a route
 * production doesn't serve.
 */
const watchTogetherPath = (username) => `/together/with/${encodeURIComponent(username)}`;

/**
 * The shared-watchlist row. With `to` it carries the Watch Together button:
 * a person's own Watch Together page, which already handles every case (your
 * shared titles if you are paired, the invite if you are not, the Premium
 * prompt if neither of you has it), or the hub from the picker's sample.
 */
function WatchlistRow({ count, to, sample = false }) {
  return (
    <div className="to-watchlist">
      <span className="to-watchlist-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
      </span>
      <span className="to-watchlist-text">
        <strong>{T.watchlistOverlap(count)}</strong>
        {to && (
          <Link className="btn btn-sm btn-primary" to={to} onClick={() => track(EVENTS.COMPARE_WATCH_TOGETHER_TAPPED, { sample })}>
            {WATCH_TOGETHER.navLabel}
          </Link>
        )}
      </span>
    </div>
  );
}

function Upsell() {
  return (
    <section className="to-card to-state">
      <h2 className="to-state-title">{T.upsellTitle}</h2>
      <p className="to-state-body">{T.upsellBody}</p>
      <PremiumGateButton reason="tasteOverlap" />
    </section>
  );
}

/**
 * The comparison itself, from already-loaded data. Split from the page so
 * Storybook can render every state without a session.
 */
export function TasteOverlapView({ username, premium, loading, error, target, overlap, sharedWatchlist, genreName, onRetry, openPanel, side = null, example = false }) {
  const [sharing, setSharing] = useState(false);
  const profilePath = `/u/${username}`;
  const name = target ? (target.display_name || target.username) : `@${username}`;

  let body;
  if (!premium) {
    body = <Upsell />;
  } else if (loading) {
    body = <LoadingSkeleton />;
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
          {/* The number on the left, the circles on the right, once the card
              is wide enough for both; stacked and centred below that. */}
          <div className="to-match-text">
            <span className="to-kicker" id="to-match-kicker">{T.matchKicker}</span>
            {o.match != null ? (
              <>
                <span className="to-match-num">{o.match}%</span>
                <span className="to-match-note">{T.basedOn(o.sharedRated)}</span>
              </>
            ) : (
              <span className="to-match-note">{T.needMoreRatings(need)}</span>
            )}
          </div>
          <div className="to-match-venn">
            <Venn watched={o.watched} name={name} />
            <span className="to-caption">{T.titlesWatched}</span>
          </div>
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
              {!o.decades.mine ? T.noDecade
                : !o.decades.theirs ? T.theirNoDecade(name)
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

        {/* The sample shows a title section only once it has titles for it. */}
        {(!example || o.loved.length > 0) && (
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
        )}

        {(!example || o.disagree.length > 0) && (
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
        )}

        {sharedWatchlist > 0 && (
          <WatchlistRow
            count={sharedWatchlist}
            sample={example}
            to={!SHOW_WATCH_TOGETHER ? null : example ? '/together' : watchTogetherPath(target.username)}
          />
        )}

        {/* A sample is nobody's match to share. */}
        {!example && (
        <div className="to-share-row">
          <button type="button" className="btn btn-primary" onClick={() => setSharing(true)}>{T.share}</button>
        </div>
        )}
      </>
    );
  }

  return (
    <div className={`to-layout${example ? '' : ' to-layout--compare'}`}>
      {side}
      <div className="to-view">
        {/* Below the two-column width the people panel is not beside the
            comparison, so this is the way back to it. */}
        {!example && <BackLink to="/compare" label={titleForView('compare')} className="to-narrow-only" />}

        <header className="to-header">
          <div className="to-header-row">
            <h1 className="to-h1">{T.youAnd(name)}</h1>
            {/* On the right of the heading, where a real comparison has Share. */}
            {example && <span className="to-pill">{T.exampleTag}</span>}
            {!example && !premium && <span className="to-chip">{T.premiumChipLabel}<PremiumMark /></span>}
            {!example && premium && overlap && target && (
              <TasteShareMenu overlap={overlap} target={target} genreName={genreName} onCustomise={() => setSharing(true)} />
            )}
          </div>
          {example && <p className="to-intro">{T.exampleNote}</p>}
        </header>

        {body}

        {sharing && overlap && target && (
          <TasteShareDialog overlap={overlap} target={target} genreName={genreName} onClose={() => setSharing(false)} />
        )}
      </div>
    </div>
  );
}

export default function TasteOverlapPage() {
  const { username } = useParams();
  const { user, profile, openPanel } = useApp();
  const premium = isPremiumProfile(profile);
  const { loading, error, target, overlap, sharedWatchlist, retry } = useTasteOverlap(username, { enabled: !!user && premium, viewerId: user?.id });
  const { genres } = useGenres();
  const genreName = useMemo(() => new Map(genres.map(g => [g.id, g.name])), [genres]);
  const navigate = useNavigate();
  const { saved, save, remove } = useSavedComparisons(user?.id);

  // A comparison that loaded is saved to "Your comparisons"; one the server
  // now refuses (blocked, gone private, deleted) leaves it.
  useEffect(() => {
    if (overlap && target) save(target);
    else if (error === 'not_found' || error === 'not_visible') void remove(username);
  }, [overlap, target, error, username, save, remove]);

  if (!user) return <LoginRedirect />;

  const refresh = (handle) => {
    track(EVENTS.SAVED_COMPARISON_REFRESHED);
    if (handle.toLowerCase() === (username || '').toLowerCase()) retry();
    else navigate(`/u/${handle}/compare`);
  };
  const forget = (handle) => {
    // Counted once the server has taken it off; a refusal is action_failed, from core.
    remove(handle).then(ok => { if (ok) track(EVENTS.SAVED_COMPARISON_REMOVED); });
  };

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
      side={<ComparePeoplePanel viewerId={user.id} selectedUsername={username} saved={saved} onRefresh={refresh} onRemove={forget} className="to-side--wide-only" />}
    />
  );
}
