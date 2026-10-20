// Watch together for someone with nobody to watch with yet: a dark hero to find
// someone (search, invite link, an example pairing), the people they follow
// with what they have in common, and a try-it demo. Free members get one
// Premium card; Premium members get a dismissible welcome instead. Everyone can
// invite. Design: Oct 2026 redesign, docs/design/watch-together/README.md. Rules: @plot/core watchTogether.js.
// Mobile parity: apps/mobile/components/watch/WatchTogetherStart.tsx.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { useApp } from '../hooks/useApp.js';
import { personName, pickDemoDeck, demoPartnerSaysYes } from '@plot/core/watchTogether.js';
import { useWatchTogetherExampleTitles } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { posterUrl } from '../utils/images.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import { useInviteShare } from '../hooks/useInviteShare.js';
import PlotLogo from './PlotLogo.jsx';

const S = T.start;

// Tone blocks stand in for posters in the example; it is not real data.
// Shades come from tokens in WatchTogetherView.css (.wt-ph-1 to .wt-ph-5).
const EXAMPLE_POSTERS = [1, 2, 3, 4, 5];

export function Wordmark() {
  return <span className="wt-wordmark"><PlotLogo inherit /></span>;
}

/** The invite link with Share and Copy, for the invite and landing pages. */
export function InviteLinkCard() {
  const { url, display, copied, share, copy } = useInviteShare();
  return (
    <section className="wt-card wt-linkcard wt-linkcard--compact">
      <span className="wt-person-text">
        <span className="wt-person-name">{T.link.inviteTitle}</span>
        <span className="wt-note">{T.link.inviteBody}</span>
      </span>
      <div className="wt-linkrow">
        <span className="wt-linkurl">{display}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{T.link.share}</button>
      </div>
    </section>
  );
}

/** A row for someone you can invite: their name, a note, and Invite. */
export function PersonRow({ person, note, sent, onInvite }) {
  return (
    <div className="wt-row">
      <PersonAvatar person={person} />
      <span className="wt-person-text">
        <span className="wt-person-name">{personName(person)}</span>
        {person.username && <span className="wt-note">@{person.username}</span>}
      </span>
      {note}
      {sent
        ? <span className="wt-chip">{T.invite.sent}</span>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => onInvite(person)}>{T.invite.invite}</button>}
    </div>
  );
}

/**
 * Search people by name or @username to invite. Results open under the box;
 * with nothing typed it shows nothing, because the suggested people have
 * their own list.
 */
export function FriendSearch({ sent, onInvite, onDark = false }) {
  const { user } = useApp();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_users', { p_query: q });
      if (live) setFound((data || []).filter(p => p.id !== user?.id).slice(0, 5));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, user?.id]);

  const searching = q.length >= 2;
  const results = searching ? found : null;
  const invite = async (person) => {
    setFailed(false);
    if (!(await onInvite(person))) setFailed(true);
  };

  return (
    <div className={`wt-find${onDark ? ' wt-find--dark' : ''}`}>
      <label className="wt-sr" htmlFor="wt-find-search">{S.findLabel}</label>
      <input id="wt-find-search" type="search" className="wt-search" placeholder={T.invite.search} value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" />
      {failed && <p className="wt-error" role="alert">{T.errors.generic}</p>}
      {searching && results && (
        <div className="wt-find-results">
          {results.length === 0 && <p className="wt-note">{S.findNone}</p>}
          {results.map(p => <PersonRow key={p.id} person={p} sent={sent.has(p.id)} onInvite={invite} />)}
        </div>
      )}
    </div>
  );
}

/** Your reusable invite link as a pill, for the hero. */
function InvitePill() {
  const { url, display, copied, share, copy } = useInviteShare();
  return (
    <div className="wt-invite-pill">
      <span className="wt-invite-pill-label">{S.notOnPlot}</span>
      <span className="wt-invite-pill-link">
        <span className="wt-invite-pill-url">{display}</span>
        <button type="button" className="btn btn-sm wt-invite-pill-btn" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
        <button type="button" className="btn btn-sm wt-invite-pill-btn wt-invite-pill-share" onClick={share} disabled={!url}>{T.link.share}</button>
      </span>
    </div>
  );
}

/** A fan of your own posters (colour blocks until they load) and an example pairing. */
function PairPreview({ titles }) {
  return (
    <div className="wt-find-preview">
      <span className="wt-find-posters" aria-hidden="true">
        {EXAMPLE_POSTERS.map((n, i) => (titles[i]
          ? <img key={`${titles[i].media_type}:${titles[i].tmdb_id}`} className="wt-find-poster" src={posterUrl(titles[i].poster_path, 'w185')} alt="" loading="lazy" />
          : <span key={n} className={`wt-find-poster wt-ph-${n}`} />))}
      </span>
      <span className="wt-find-match">
        <svg className="wt-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
        {`${S.examplePair} · ${S.exampleCount}`}
        <span className="wt-example-badge">{S.example}</span>
      </span>
    </div>
  );
}

/** The dark top card: one job, find someone to watch with. */
function Hero({ titles, premium, sent, onInvite }) {
  return (
    <section className="wt-ink wt-hero" aria-labelledby="wt-start-title">
      <div className="wt-hero-main">
        <h2 className="wt-hero-title" id="wt-start-title">{premium ? S.premiumPitchTitle : S.pitchTitle}</h2>
        <p className="wt-hero-body">{premium ? S.premiumPitchBody : S.pitchBody}</p>
        <FriendSearch sent={sent} onInvite={onInvite} onDark />
        <InvitePill />
      </div>
      <PairPreview titles={titles} />
    </section>
  );
}

/** People you follow, ranked by overlap. Private profiles say when counts show. */
function FollowingList({ people, sent, onInvite }) {
  if (!people.length) return null;
  const countNote = (p) => (typeof p.overlap_count === 'number'
    ? <span className="wt-count">{S.inCommon(p.overlap_count)}</span>
    : <span className="wt-note">{S.countLater}</span>);
  return (
    <section className="wt-section" aria-labelledby="wt-following">
      <div className="wt-section-head">
        <h2 className="wt-heading" id="wt-following">{S.peopleTitle}</h2>
        <span className="wt-note">{S.peopleNote}</span>
      </div>
      <div className="wt-list">
        {people.map(p => <PersonRow key={p.id} person={p} note={countNote(p)} sent={sent.has(p.id)} onInvite={onInvite} />)}
      </div>
      <p className="wt-note">{T.invite.mutualNote}</p>
    </section>
  );
}

/** Free: the one place that says what Premium is for. */
function PremiumCard() {
  return (
    <section className="wt-card wt-premium-card">
      <h2 className="wt-card-title">{S.premiumCardTitle}</h2>
      <p className="wt-card-body">{S.premiumCardBody}</p>
      <div className="wt-premium-prompt wt-premium-prompt--row">
        <Link to={premiumPlansPath('/together')} className="btn btn-primary">{S.getPremium}</Link>
        <span className="wt-note">{PLANS_PAGE.premium.priceSummary}</span>
      </div>
    </section>
  );
}

const WELCOME_KEY = 'plot:watch-together:welcome-dismissed';

/** "You're on Premium": stays until dismissed. */
function Welcome() {
  const [hidden, setHidden] = useState(() => readStorage(WELCOME_KEY) === '1');
  if (hidden) return null;
  const dismiss = () => { writeStorage(WELCOME_KEY, '1'); setHidden(true); };
  return (
    <section className="wt-welcome" role="status">
      <svg className="wt-welcome-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
      <span className="wt-banner-text">
        <span className="wt-welcome-body"><strong>{S.welcomeTitle}</strong> {S.welcomeBody}</span>
      </span>
      <button type="button" className="wt-welcome-close" onClick={dismiss} aria-label={T.hub.dismiss}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </section>
  );
}

/**
 * Five of your own titles (topped up from trending), with an example partner
 * who answers at random and always matches by the last card. Each answer shows
 * what you and Sam said. The parent keys this on the pool size, so the deck is
 * drawn once real titles have loaded.
 */
function Demo({ premium, pool }) {
  const [deck, setDeck] = useState(() => pickDemoDeck(pool));
  const [index, setIndex] = useState(0);
  const [match, setMatch] = useState(null);
  const [last, setLast] = useState(/** @type {{ title: string, mine: boolean, theirs: boolean } | null} */ (null));
  const card = deck[index];
  const name = S.exampleName;
  const say = (yes) => (yes ? T.session.yes : T.session.no);
  const again = () => { setDeck(pickDemoDeck(pool)); setIndex(0); setMatch(null); setLast(null); };
  const answer = (yes) => {
    const theirs = demoPartnerSaysYes({ index, total: deck.length, matchedSoFar: !!match });
    setLast({ title: card.title, mine: yes, theirs });
    if (yes && theirs) setMatch(card);
    setIndex(i => i + 1);
  };

  const head = (
    <div className="wt-demo-head">
      <span className="wt-section-label">{S.demoHeading}</span>
      <span className="wt-example-badge">{S.example}</span>
    </div>
  );
  const response = last && (
    <div className="wt-demo-response" role="status">
      <span className="wt-note">{last.title}</span>
      <span className="wt-demo-answers">
        <span className={`wt-demo-answer${last.mine ? ' yes' : ''}`}>{S.demoYouSaid(say(last.mine))}</span>
        <span className={`wt-demo-answer${last.theirs ? ' yes' : ''}`}>{S.demoTheySaid(name, say(last.theirs))}</span>
      </span>
    </div>
  );

  if (!deck.length) {
    return <div className="wt-card wt-example wt-demo">{head}<p className="wt-note">{S.demoEmpty}</p></div>;
  }
  if (match) {
    return (
      <div className="wt-card wt-example wt-demo" role="status">
        {head}
        <DemoPoster title={match} />
        <span className="wt-chip wt-chip--accent">{S.demoDoneTitle}</span>
        <span className="wt-person-name">{match.title}</span>
        <p className="wt-card-body">{S.demoDoneBody}</p>
        <div className="wt-top-actions">
          {!premium && <Link to={premiumPlansPath('/together')} className="btn btn-primary btn-sm">{S.getPremium}</Link>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={again}>{S.demoAgain}</button>
        </div>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="wt-card wt-example wt-demo">
        {head}
        {response}
        <span className="wt-person-name">{S.demoNoMatchTitle}</span>
        <p className="wt-card-body">{S.demoNoMatchBody}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={again}>{S.demoAgain}</button>
      </div>
    );
  }
  const year = (card.release_date || '').slice(0, 4);
  return (
    <div className="wt-card wt-example wt-demo">
      {head}
      <DemoPoster title={card} counter={T.session.counter(index + 1, deck.length)} />
      <span className="wt-person-name wt-center">{card.title}</span>
      {year && <span className="wt-note">{[year, card.media_type === 'tv' ? T.overlap.show : null].filter(Boolean).join(' · ')}</span>}
      <div className="wt-top-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => answer(false)}>{T.session.no}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => answer(true)}>{T.session.yes}</button>
      </div>
      {response}
      <p className="wt-note wt-center">{S.demoNote}</p>
    </div>
  );
}

function DemoPoster({ title, counter }) {
  const url = posterUrl(title.poster_path, 'w342');
  return (
    <span className="wt-demo-poster">
      {url ? <img src={url} alt="" /> : <span className="wt-poster--empty" aria-hidden="true" />}
      {counter && <span className="wt-swipe-counter">{counter}</span>}
    </span>
  );
}

export default function WatchTogetherStart({ premium, suggested, onInvite }) {
  const { watchlist } = useApp();
  const titles = useWatchTogetherExampleTitles(watchlist?.items);
  const [sent, setSent] = useState(() => new Set());
  const invite = async (person) => {
    const ok = await onInvite(person);
    if (ok) setSent(prev => new Set(prev).add(person.id));
    return ok;
  };

  return (
    <div className="wt-start">
      <h1 className="wt-sr">{T.hub.title}</h1>
      {premium && <Welcome />}
      <Hero titles={titles} premium={premium} sent={sent} onInvite={invite} />
      <FollowingList people={suggested} sent={sent} onInvite={invite} />
      <div className={`wt-start-bottom${premium ? ' wt-start-bottom--solo' : ''}`}>
        <div className="wt-start-seeit">
          <div className="wt-person-text">
            <h2 className="wt-heading">{premium ? S.seeItTitle : S.tryTitle}</h2>
            <span className="wt-note">{premium ? S.premiumSeeItBody : S.tryBody}</span>
          </div>
          <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={titles} />
        </div>
        {!premium && <PremiumCard />}
      </div>
    </div>
  );
}
