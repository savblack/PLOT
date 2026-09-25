// Watch together (Premium) at /together: the hub, the people picker, invites
// and the titles you share with one or more partners. Design:
// docs/design/watch-together/README.md. Rules and data: @plot/core
// watchTogether.js and useWatchTogether.js. The two-person yes-or-no session
// and shared lists come in later changes. Mobile parity: not built yet;
// tracked in the Watch together PR.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { personName, filterByKind, splitGroupMatches, shufflePick } from '@plot/core/watchTogether.js';
import { useWatchTogether, useWatchTogetherTitles, useWatchTogetherSuggestions } from '@plot/core/useWatchTogether.js';
import { supabase } from '@plot/core/supabase.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COMMON } from '../copy/common.js';
import { posterUrl } from '../utils/images.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { AcceptDialog, PersonAvatar } from './WatchTogetherParts.jsx';
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
  const { people: suggested } = useWatchTogetherSuggestions(premium ? user?.id : null);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { partners, incoming, outgoing } = wt;
  const requestCount = incoming.length + outgoing.length;

  const answer = async (person, accept, shareFull) => {
    setBusy(true);
    await wt.respond(person.other_id, accept, shareFull);
    setBusy(false);
    setReviewing(null);
  };

  return (
    <div className="wt-page">
      <header className="wt-head">
        <h1 className="wt-title">{T.hub.title}</h1>
        <span className="wt-premium">{PLANS_PAGE.premium.name}</span>
      </header>

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
          {premium && <Link to="/together/invite" className="wt-link">{T.hub.invite}</Link>}
        </div>
        {partners.length === 0
          ? <div className="empty-state"><div className="empty-title">{T.hub.noPartnersTitle}</div><div className="empty-body">{T.hub.noPartnersBody}</div></div>
          : partners.map(p => (
            <Link key={p.other_id} to={`/together/with/${encodeURIComponent(p.username)}`} className="wt-row wt-row--link interactive-surface">
              <PersonAvatar person={p} />
              <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span><span className="wt-note">{T.hub.bothSaved(p.overlap_count ?? 0)}</span></span>
              <Chevron />
            </Link>
          ))}
      </section>

      {premium
        ? suggested.length > 0 && (
          <Link to="/together/invite" className="wt-banner interactive-surface">
            <span className="wt-banner-text"><span className="wt-banner-title">{T.hub.suggested}</span><span className="wt-note">{T.hub.suggestedBody}</span></span>
            <AvatarStack people={suggested} />
            <Chevron />
          </Link>
        )
        : (
          <Link to={premiumPlansPath('/together')} className="wt-banner interactive-surface">
            <span className="wt-banner-text"><span className="wt-banner-title">{T.hub.freeTitle}</span><span className="wt-note">{PLANS_PAGE.premium.priceSummary}</span></span>
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
  const go = () => navigate(`/together/with/${chosen.map(p => encodeURIComponent(p.username)).join(',')}`);

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
      <div className="wt-actions">
        <button type="button" className="btn btn-primary" disabled={!chosen.length} onClick={go}>{chosen.length > 1 ? T.overlap.groupAction : T.tile.pairedAction}</button>
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
    </div>
  );
}

/* ── Titles with one or more partners ────────────────────────────────── */

function Together({ wt, usernames }) {
  const { user, openPanel } = useApp();
  const people = usernames.map(u => wt.partners.find(p => p.username === u)).filter(Boolean);
  // The hook keys on the sorted ids, so a fresh array each render is fine.
  const { titles, loading, error } = useWatchTogetherTitles(people.map(p => p.other_id));
  const [kind, setKind] = useState('all');
  const [topId, setTopId] = useState(null);

  const shown = filterByKind(titles, kind);
  const top = shown.find(t => t.tmdb_id === topId) || shown[0] || null;
  const rest = shown.filter(t => t !== top);
  const group = people.length > 1;
  const nameOf = (id) => id === user?.id ? T.overlap.you : personName(people.find(p => p.other_id === id));

  if (!wt.loading && people.length !== usernames.length) {
    return <div className="wt-page"><Link to="/together" className="wt-back">{COMMON.back}</Link><p className="wt-note">{T.overlap.notPartners}</p></div>;
  }
  const { all, some } = splitGroupMatches(shown, people.length + 1);

  return (
    <div className="wt-page">
      <Link to="/together" className="wt-back">{COMMON.back}</Link>
      <div className="wt-who"><AvatarStack people={people} /><span className="wt-note">{group ? T.overlap.group(people.map(personName)) : T.overlap.pair(personName(people[0] || {}))}</span></div>
      <h1 className="wt-title">{group ? T.overlap.groupHeading : T.overlap.heading(titles.length)}</h1>

      <div className="wt-chips" role="group" aria-label={T.overlap.filter}>
        {[['all', T.overlap.all], ['movie', T.overlap.movies], ['tv', T.overlap.shows]].map(([k, label]) => (
          <button key={k} type="button" className={`wt-filter${kind === k ? ' active' : ''}`} aria-pressed={kind === k} onClick={() => { setKind(k); setTopId(null); }}>{label}</button>
        ))}
      </div>

      {error && <p className="wt-error" role="alert">{T.errors[error]}</p>}
      {loading ? <p className="wt-note" role="status">{COMMON.loading}</p>
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

/* ── Route ───────────────────────────────────────────────────────────── */

export default function WatchTogetherView({ page = 'hub' }) {
  const { user, profile } = useApp();
  const params = useParams();
  const wt = useWatchTogether(user?.id);
  const premium = isPremiumProfile(profile);

  if (page === 'pick') return <Picker wt={wt} />;
  if (page === 'invite') return premium ? <Invite wt={wt} /> : <Hub wt={wt} premium={premium} profile={profile} />;
  if (page === 'with') {
    const usernames = (params.usernames || '').split(',').map(decodeURIComponent).filter(Boolean);
    return <Together wt={wt} usernames={usernames} />;
  }
  return <Hub wt={wt} premium={premium} profile={profile} />;
}
