// Watch together at /together: the hub (or the start page when you have
// nobody to watch with yet), the people picker, invites, the titles you share
// with one or more partners and the two-person session. Anyone can invite;
// one of you needs Premium to decide together. Design:
// docs/design/watch-together/README.md. Rules and data: @plot/core
// watchTogether.js and useWatchTogether.js. Mobile parity: not built yet;
// tracked in the Watch together PR.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { personName, filterByKind, splitGroupMatches, shufflePick, sessionProgress, swipeDecision, SWIPE_THRESHOLD } from '@plot/core/watchTogether.js';
import { useWatchTogether, useWatchTogetherTitles, useWatchTogetherSuggestions, useWatchTogetherSession, startWatchTogetherSession, liveWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { supabase } from '@plot/core/supabase.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COMMON } from '../copy/common.js';
import { posterUrl } from '../utils/images.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { AcceptDialog, PersonAvatar, ShareListDialog, WatchTogetherTile } from './WatchTogetherParts.jsx';
import WatchTogetherStart, { InviteLinkCard } from './WatchTogetherStart.jsx';
import { collectionPath, customListKey } from '@plot/core/listCollections.js';
import './WatchTogetherView.css';

function Chevron() {
  return <svg className="wt-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>;
}

function AvatarStack({ people }) {
  return <span className="wt-stack" aria-hidden="true">{people.slice(0, 3).map((p, i) => <PersonAvatar key={p.id || p.other_id || i} person={p} size="sm" />)}</span>;
}

function Poster({ title, size = 'md' }) {
  const url = posterUrl(title.poster_path, size === 'lg' ? 'w342' : 'w185');
  return url
    ? <img className={`wt-poster wt-poster--${size}`} src={url} alt="" loading="lazy" />
    : <span className={`wt-poster wt-poster--${size} wt-poster--empty`} aria-hidden="true" />;
}

function titleMeta(t) {
  const year = (t.release_date || '').slice(0, 4);
  const kind = t.media_type === 'tv' ? T.overlap.show : null;
  return [year, kind].filter(Boolean).join(' · ');
}

/* ── Hub ─────────────────────────────────────────────────────────────── */

function Hub({ wt, premium, profile }) {
  const navigate = useNavigate();
  const { user } = useApp();
  const { people: suggested, loading: suggestionsLoading, refresh: refreshSuggestions } = useWatchTogetherSuggestions(user?.id);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { partners, incoming, outgoing } = wt;
  const requestCount = incoming.length + outgoing.length;

  // Nobody to watch with yet: the start page, for Free and Premium alike.
  if (wt.loading || suggestionsLoading) return <div className="wt-page" />;
  if (!partners.length && !requestCount) {
    const invite = async (person) => {
      const result = await wt.send(person.id);
      if (result.ok) refreshSuggestions();
      return result.ok;
    };
    return <div className="wt-page wt-page--wide"><WatchTogetherStart premium={premium} suggested={suggested} onInvite={invite} /></div>;
  }

  const answer = async (person, accept, shareFull) => {
    setBusy(true);
    await wt.respond(person.other_id, accept, shareFull);
    setBusy(false);
    setReviewing(null);
  };

  return (
    <div className="wt-page">
      {/* The app header already shows the page title. */}
      <h1 className="wt-sr">{T.hub.title}</h1>

      <section className="wt-card wt-decide">
        <h2 className="wt-card-title">{T.hub.decideTitle}</h2>
        <p className="wt-card-body">{T.hub.decideBody}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/together/pick')} disabled={!partners.length}>{T.hub.whosWatching}</button>
      </section>

      {requestCount > 0 && (
        <section className="wt-section" aria-labelledby="wt-requests">
          <h2 className="wt-section-label" id="wt-requests">{T.hub.requests}</h2>
          {incoming.map(p => (
            <div key={p.other_id} className="wt-row">
              <PersonAvatar person={p} />
              <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span><span className="wt-note">{T.requests.wantsTo}</span></span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => answer(p, false)} disabled={busy}>{T.requests.decline}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setReviewing(p)} disabled={busy}>{T.requests.review}</button>
            </div>
          ))}
          {outgoing.map(p => (
            <div key={p.other_id} className="wt-row">
              <PersonAvatar person={p} />
              <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span><span className="wt-note">{T.requests.sent}</span></span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => wt.cancel(p.other_id)}>{T.requests.cancel}</button>
            </div>
          ))}
        </section>
      )}

      <section className="wt-section" aria-labelledby="wt-partners">
        <div className="wt-section-head">
          <h2 className="wt-section-label" id="wt-partners">{T.hub.partners}</h2>
          <Link to="/together/invite" className="wt-link">{T.hub.invite}</Link>
        </div>
        {partners.length === 0
          ? <div className="empty-state"><div className="empty-title">{T.hub.noPartnersTitle}</div><div className="empty-body">{T.hub.noPartnersBody}</div></div>
          : partners.map(p => (
            <Link key={p.other_id} to={`/together/with/${encodeURIComponent(p.username)}`} className="wt-row wt-row--link interactive-surface">
              <PersonAvatar person={p} />
              <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span><span className="wt-note">{p.can_decide === false ? T.hub.lockedNote : T.hub.bothSaved(p.overlap_count ?? 0)}</span></span>
              <Chevron />
            </Link>
          ))}
      </section>

      {suggested.length > 0 && (
        <Link to="/together/invite" className="wt-banner interactive-surface">
          <span className="wt-banner-text"><span className="wt-banner-title">{T.hub.suggested}</span><span className="wt-note">{T.hub.suggestedBody}</span></span>
          <AvatarStack people={suggested} />
          <Chevron />
        </Link>
      )}
      {!premium && partners.some(p => p.can_decide === false) && (
        <Link to={premiumPlansPath('/together')} className="wt-banner interactive-surface">
          <span className="wt-banner-text"><span className="wt-banner-title">{T.locked.title}</span><span className="wt-note">{PLANS_PAGE.premium.priceSummary}</span></span>
          <Chevron />
        </Link>
      )}

      {reviewing && (
        <AcceptDialog person={reviewing} viewerIsPublic={!!profile?.is_public} busy={busy}
          onClose={() => setReviewing(null)}
          onDecline={() => answer(reviewing, false)}
          onAccept={(shareFull) => answer(reviewing, true, shareFull)} />
      )}
    </div>
  );
}

/* ── Who's watching? ─────────────────────────────────────────────────── */

function Picker({ wt }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState(() => new Set());
  const chosen = wt.partners.filter(p => picked.has(p.other_id));
  const toggle = (id) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const browse = () => navigate(`/together/with/${chosen.map(p => encodeURIComponent(p.username)).join(',')}`);
  const decide = async () => {
    setStarting(true); setError(null);
    const result = await startWatchTogetherSession(chosen[0].other_id);
    setStarting(false);
    if (result.ok) navigate(`/together/session/${result.data}`);
    else setError(T.errors[result.code]);
  };

  return (
    <div className="wt-page">
      <Link to="/together" className="wt-back">{COMMON.back}</Link>
      <h1 className="wt-title">{T.hub.whosWatching}</h1>
      <fieldset className="wt-pick">
        <legend className="wt-sr">{T.hub.partners}</legend>
        {wt.partners.map(p => (
          <label key={p.other_id} className={`wt-row wt-pick-row${picked.has(p.other_id) ? ' selected' : ''}`}>
            <PersonAvatar person={p} />
            <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span><span className="wt-note">{T.hub.bothSaved(p.overlap_count ?? 0)}</span></span>
            <input type="checkbox" checked={picked.has(p.other_id)} onChange={() => toggle(p.other_id)} />
          </label>
        ))}
      </fieldset>
      {error && <p className="wt-error" role="alert">{error}</p>}
      <div className="wt-actions">
        {chosen.length === 1 && <button type="button" className="btn btn-secondary" onClick={browse}>{T.tile.pairedAction}</button>}
        {chosen.length > 1
          ? <button type="button" className="btn btn-primary" onClick={browse}>{T.overlap.groupAction}</button>
          : <button type="button" className="btn btn-primary" disabled={!chosen.length || starting} onClick={decide}>{T.session.start}</button>}
      </div>
    </div>
  );
}

/* ── Invite ──────────────────────────────────────────────────────────── */

function Invite({ wt }) {
  const { user } = useApp();
  const { people: suggested } = useWatchTogetherSuggestions(user?.id);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [sent, setSent] = useState(() => new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_users', { p_query: q });
      if (live) setResults((data || []).filter(p => p.id !== user?.id));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, user?.id]);

  const invite = async (person) => {
    setError(null);
    const result = await wt.send(person.id);
    if (result.ok) setSent(prev => new Set(prev).add(person.id));
    else setError(T.errors[result.code]);
  };

  const list = query.trim().length >= 2 ? results : suggested;
  return (
    <div className="wt-page">
      <Link to="/together" className="wt-back">{COMMON.back}</Link>
      <h1 className="wt-title">{T.invite.title}</h1>
      <p className="wt-card-body">{T.invite.body}</p>
      <label className="wt-sr" htmlFor="wt-invite-search">{T.invite.search}</label>
      <input id="wt-invite-search" type="search" className="wt-search" placeholder={T.invite.search} value={query} onChange={e => setQuery(e.target.value)} />
      {error && <p className="wt-error" role="alert">{error}</p>}
      {query.trim().length < 2 && <h2 className="wt-section-label">{T.invite.suggested}</h2>}
      {list.length === 0 && query.trim().length < 2 && <p className="wt-note">{T.invite.noSuggestions}</p>}
      {list.map(p => (
        <div key={p.id} className="wt-row">
          <PersonAvatar person={p} />
          <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span><span className="wt-note">@{p.username}</span></span>
          {sent.has(p.id)
            ? <span className="wt-chip">{T.invite.sent}</span>
            : <button type="button" className="btn btn-primary btn-sm" onClick={() => invite(p)}>{T.invite.invite}</button>}
        </div>
      ))}
      <InviteLinkCard compact />
    </div>
  );
}

/* ── Someone you aren't watching together with yet ────────────────────── */

/**
 * /together/with/:username for a person who isn't a partner. Shows the same
 * tile as their profile (invite, request sent, reply to their request, or the
 * Premium upsell), and turns into the shared list the moment you're paired.
 * An unknown, blocked or hidden handle gets the plain note: get_profile_card
 * returns nothing for all three, and they must look the same.
 */
function NotPairedYet({ wt, username }) {
  const { user, profile } = useApp();
  const [person, setPerson] = useState(undefined);

  useEffect(() => {
    let live = true;
    supabase.rpc('get_profile_card', { p_username: username }).then(({ data }) => {
      if (live) setPerson(Array.isArray(data) && data[0] ? data[0] : null);
    }, () => { if (live) setPerson(null); });
    return () => { live = false; };
  }, [username]);

  return (
    <div className="wt-page">
      <Link to="/together" className="wt-back">{COMMON.back}</Link>
      {person === undefined ? null : person
        ? <WatchTogetherTile person={person} viewer={user} viewerProfile={profile} onChange={wt.refresh} />
        : <p className="wt-note">{T.overlap.notPartners}</p>}
    </div>
  );
}

/* ── Titles with one or more partners ────────────────────────────────── */

function Together({ wt, usernames }) {
  const { user, openPanel, customLists } = useApp();
  const [sharing, setSharing] = useState(false);
  const navigate = useNavigate();
  const people = usernames.map(u => wt.partners.find(p => p.username === u)).filter(Boolean);
  // The hook keys on the sorted ids, so a fresh array each render is fine.
  const { titles, loading, error } = useWatchTogetherTitles(people.map(p => p.other_id));
  const locked = error === 'premium_required';
  const [kind, setKind] = useState('all');
  const [topId, setTopId] = useState(null);

  const shown = filterByKind(titles, kind);
  const top = shown.find(t => t.tmdb_id === topId) || shown[0] || null;
  const rest = shown.filter(t => t !== top);
  const group = people.length > 1;
  const nameOf = (id) => id === user?.id ? T.overlap.you : personName(people.find(p => p.other_id === id));

  if (!wt.loading && people.length !== usernames.length) {
    // One person you aren't paired with yet (the usual way in from taste
    // overlap or a shared link): offer the invite rather than a dead end.
    if (usernames.length === 1) return <NotPairedYet wt={wt} username={usernames[0]} />;
    return <div className="wt-page"><Link to="/together" className="wt-back">{COMMON.back}</Link><p className="wt-note">{T.overlap.notPartners}</p></div>;
  }
  const { all, some } = splitGroupMatches(shown, people.length + 1);
  const decide = async () => {
    const result = await startWatchTogetherSession(people[0].other_id);
    if (result.ok) navigate(`/together/session/${result.data}`);
  };

  return (
    <div className="wt-page">
      <Link to="/together" className="wt-back">{COMMON.back}</Link>
      <div className="wt-who"><AvatarStack people={people} /><span className="wt-note">{group ? T.overlap.group(people.map(personName)) : T.overlap.pair(personName(people[0] || {}))}</span></div>
      <h1 className="wt-title">{group ? T.overlap.groupHeading : T.overlap.heading(titles.length)}</h1>
      {!group && titles.length > 0 && <div><button type="button" className="btn btn-primary btn-sm" onClick={decide}>{T.session.start}</button></div>}
      {locked && (
        <section className="wt-card" role="status">
          <h2 className="wt-card-title">{T.locked.title}</h2>
          <p className="wt-card-body">{T.locked.body(group ? T.overlap.everyone : personName(people[0] || {}))}</p>
          <div className="wt-premium-prompt">
            <Link to={premiumPlansPath(`/together/with/${usernames.map(encodeURIComponent).join(',')}`)} className="btn btn-primary btn-sm">{T.start.getPremium}</Link>
            <span className="wt-note">{PLANS_PAGE.premium.priceSummary}</span>
          </div>
        </section>
      )}

      <div className="wt-chips" role="group" aria-label={T.overlap.filter}>
        {[['all', T.overlap.all], ['movie', T.overlap.movies], ['tv', T.overlap.shows]].map(([k, label]) => (
          <button key={k} type="button" className={`wt-filter${kind === k ? ' active' : ''}`} aria-pressed={kind === k} onClick={() => { setKind(k); setTopId(null); }}>{label}</button>
        ))}
      </div>

      {error && !locked && <p className="wt-error" role="alert">{T.errors[error]}</p>}
      {loading ? <p className="wt-note" role="status">{COMMON.loading}</p>
        : locked ? null
        : !shown.length ? <div className="empty-state"><div className="empty-title">{T.overlap.emptyTitle}</div><div className="empty-body">{T.overlap.emptyBody(group ? T.overlap.everyone : personName(people[0] || {}))}</div></div>
        : group ? (
          <>
            {all.length > 0 && <TitleSection label={T.overlap.savedByAll} titles={all} openPanel={openPanel} />}
            {some.length > 0 && <TitleSection label={T.overlap.savedBySome} titles={some} openPanel={openPanel} who={t => T.overlap.savedBy(t.saved_by.map(nameOf))} />}
          </>
        ) : (
          <>
            {top && (
              <section className="wt-card wt-top">
                <Poster title={top} size="lg" />
                <div className="wt-top-text">
                  <span className="wt-chip wt-chip--accent">{T.overlap.topMatch}</span>
                  <h2 className="wt-card-title">{top.title}</h2>
                  <span className="wt-note">{titleMeta(top)}</span>
                  <div className="wt-top-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openPanel(top.tmdb_id, top.media_type)}>{T.overlap.choose}</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTopId(shufflePick(shown, top.tmdb_id)?.tmdb_id ?? null)}>{T.overlap.shuffle}</button>
                  </div>
                </div>
              </section>
            )}
            {rest.length > 0 && <TitleSection label={T.overlap.alsoOnBoth} titles={rest} openPanel={openPanel} />}
          </>
        )}
      {!group && people[0] && (() => {
        const partner = people[0];
        const existing = customLists?.lists?.find(l => l.people?.some(p => p.user_id === partner.other_id));
        return (
          <div className="wt-session-foot">
            <span className="wt-note">{existing ? T.sharedList.summary(existing.name, existing.items?.length ?? 0) : T.sharedList.want(personName(partner))}</span>
            {existing
              ? <Link to={collectionPath(customListKey(existing.id))} className="btn btn-secondary btn-sm">{T.sharedList.open}</Link>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSharing(true)}>{T.sharedList.make}</button>}
          </div>
        );
      })()}
      {sharing && <ShareListDialog partner={people[0]} overlapCount={titles.length} onClose={() => setSharing(false)} />}
    </div>
  );
}

function TitleSection({ label, titles, openPanel, who }) {
  return (
    <section className="wt-section">
      <h2 className="wt-section-label">{label}</h2>
      {titles.map(t => (
        <button key={`${t.media_type}:${t.tmdb_id}`} type="button" className="wt-row wt-row--link interactive-surface" onClick={() => openPanel(t.tmdb_id, t.media_type)}>
          <Poster title={t} />
          <span className="wt-person-text"><span className="wt-person-name">{t.title}</span><span className="wt-note">{titleMeta(t)}</span></span>
          {who && <span className="wt-note wt-who-saved">{who(t)}</span>}
        </button>
      ))}
    </section>
  );
}


/* ── Two-person yes-or-no session ────────────────────────────────────── */

function SessionCardView({ card, counter, onDecide }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const url = posterUrl(card.poster_path, 'w500');
  const finish = () => {
    if (!dragging) return;
    setDragging(false);
    const decision = swipeDecision(dx);
    setDx(0);
    if (decision) onDecide(decision === 'yes');
  };
  const show = (v) => Math.min(Math.max(v / SWIPE_THRESHOLD, 0), 1);
  return (
    <div className="wt-swipe"
      style={{ transform: `translateX(${dx}px) rotate(${dx / 20}deg)`, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
      onPointerDown={e => { start.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId); setDragging(true); }}
      onPointerMove={e => { if (dragging) setDx(e.clientX - start.current); }}
      onPointerUp={finish} onPointerCancel={finish}>
      {url ? <img className="wt-swipe-img" src={url} alt="" draggable="false" /> : <span className="wt-swipe-img wt-poster--empty" aria-hidden="true" />}
      <span className="wt-swipe-scrim" aria-hidden="true" />
      <span className="wt-swipe-counter">{counter}</span>
      <span className="wt-stamp wt-stamp--yes" style={{ opacity: show(dx) }} aria-hidden="true">{T.session.yes}</span>
      <span className="wt-stamp wt-stamp--no" style={{ opacity: show(-dx) }} aria-hidden="true">{T.session.no}</span>
      <span className="wt-swipe-text">
        <span className="wt-swipe-title">{card.title}</span>
        <span className="wt-swipe-meta">{titleMeta(card)}</span>
      </span>
    </div>
  );
}

function SessionView({ wt, sessionId }) {
  const navigate = useNavigate();
  const { openPanel } = useApp();
  const { session, error, loading, vote } = useWatchTogetherSession(sessionId);
  const [showMatches, setShowMatches] = useState(false);
  const [justMatched, setJustMatched] = useState(null);
  const other = wt.partners.find(p => p.other_id === session?.other_id);
  const name = personName(other || {});
  const progress = sessionProgress(session);

  const decide = async (yes) => {
    const card = progress.card;
    if (!card) return;
    setJustMatched(null);
    const result = await vote(card, yes);
    if (result.matched) setJustMatched(card);
  };
  const restart = async () => {
    const result = await startWatchTogetherSession(session.other_id);
    if (result.ok) navigate(`/together/session/${result.data}`, { replace: true });
  };

  if (loading && !session) return <div className="wt-page"><p className="wt-note" role="status">{COMMON.loading}</p></div>;
  if (error || !session) return <div className="wt-page"><Link to="/together" className="wt-back">{COMMON.back}</Link><p className="wt-note">{T.errors[error || 'generic']}</p></div>;

  const matchList = (
    <section className="wt-section">
      <h2 className="wt-section-label">{T.session.matchesTitle}</h2>
      {progress.matches.length === 0 && <p className="wt-note">{T.session.noMatches}</p>}
      {progress.matches.map(t => (
        <button key={`${t.media_type}:${t.tmdb_id}`} type="button" className="wt-row wt-row--link interactive-surface" onClick={() => openPanel(t.tmdb_id, t.media_type)}>
          <Poster title={t} />
          <span className="wt-person-text"><span className="wt-person-name">{t.title}</span><span className="wt-note">{titleMeta(t)}</span></span>
          <span className="wt-link">{T.session.choose}</span>
        </button>
      ))}
    </section>
  );

  return (
    <div className="wt-page wt-session">
      <header className="wt-session-head">
        <Link to="/together" className="wt-back">{T.session.leave}</Link>
        <div className="wt-session-title">
          <h1 className="wt-card-title">{T.session.heading(name)}</h1>
          <span className="wt-note">{T.session.fromBoth}</span>
        </div>
        <span className="wt-note wt-session-them">{personName(other || {})}: {T.session.theyAnswered(Math.min(session.other_answered + 1, progress.total))}</span>
      </header>

      {!session.live ? (
        <div className="wt-card">
          <p className="wt-card-body">{T.session.ended}</p>
          <div><button type="button" className="btn btn-primary btn-sm" onClick={restart}>{T.session.startAgain}</button></div>
          {matchList}
        </div>
      ) : progress.total === 0 ? (
        <div className="empty-state"><div className="empty-body">{T.session.empty(name)}</div></div>
      ) : showMatches ? (
        <>
          {matchList}
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowMatches(false)}>{T.session.hideMatches}</button></div>
        </>
      ) : progress.done ? (
        <>
          <div className="wt-card"><h2 className="wt-card-title">{T.session.doneTitle}</h2><p className="wt-card-body">{T.session.doneBody(name)}</p></div>
          {matchList}
        </>
      ) : (
        <>
          {justMatched && (
            <div className="wt-card wt-match" role="status">
              <span className="wt-chip wt-chip--accent">{T.session.bothIn}</span>
              <span className="wt-person-name">{justMatched.title}</span>
              <div><button type="button" className="btn btn-primary btn-sm" onClick={() => openPanel(justMatched.tmdb_id, justMatched.media_type)}>{T.session.choose}</button></div>
            </div>
          )}
          <SessionCardView key={`${progress.card.media_type}:${progress.card.tmdb_id}`} card={progress.card}
            counter={T.session.counter(progress.index + 1, progress.total)} onDecide={decide} />
          <p className="wt-note wt-center">{T.session.swipeHint}</p>
          <div className="wt-session-buttons">
            <button type="button" className="btn btn-secondary" onClick={() => decide(false)}>{T.session.no}</button>
            <button type="button" className="btn btn-primary" onClick={() => decide(true)}>{T.session.yes}</button>
          </div>
          <div className="wt-session-foot">
            <span className="wt-note">{T.session.matchesSoFar(progress.matches.length)}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowMatches(true)}>{T.session.seeMatches}</button>
          </div>
        </>
      )}
    </div>
  );
}

/* Join from a notification: find the live session with this partner. */
function JoinSession({ wt, username }) {
  const navigate = useNavigate();
  const partner = wt.partners.find(p => p.username === username);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!partner) return undefined;
    let live = true;
    liveWatchTogetherSession(partner.other_id).then(result => {
      if (!live) return;
      if (result.ok && result.data) navigate(`/together/session/${result.data}`, { replace: true });
      else setMissing(true);
    });
    return () => { live = false; };
  }, [partner, navigate]);
  if (!wt.loading && !partner) return <div className="wt-page"><Link to="/together" className="wt-back">{COMMON.back}</Link><p className="wt-note">{T.overlap.notPartners}</p></div>;
  if (!missing) return <div className="wt-page"><p className="wt-note" role="status">{COMMON.loading}</p></div>;
  return (
    <div className="wt-page">
      <Link to="/together" className="wt-back">{COMMON.back}</Link>
      <p className="wt-card-body">{T.session.ended}</p>
      <div><Link to={`/together/with/${encodeURIComponent(username)}`} className="btn btn-primary btn-sm">{T.tile.pairedAction}</Link></div>
    </div>
  );
}

/* ── Route ───────────────────────────────────────────────────────────── */

export default function WatchTogetherView({ page = 'hub' }) {
  const { user, profile } = useApp();
  const params = useParams();
  const wt = useWatchTogether(user?.id);
  const premium = isPremiumProfile(profile);

  if (page === 'pick') return <Picker wt={wt} />;
  if (page === 'invite') return <Invite wt={wt} />;
  if (page === 'session') return <SessionView wt={wt} sessionId={params.sessionId} />;
  if (page === 'join') return <JoinSession wt={wt} username={decodeURIComponent(params.username || '')} />;
  if (page === 'with') {
    const usernames = (params.usernames || '').split(',').map(decodeURIComponent).filter(Boolean);
    return <Together wt={wt} usernames={usernames} />;
  }
  return <Hub wt={wt} premium={premium} profile={profile} />;
}
