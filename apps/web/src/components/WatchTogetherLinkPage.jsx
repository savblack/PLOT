// Where a Watch together invite link lands: /watch-with/:username/:key.
// Public, so someone without an account can open it. Signed out: who sent it
// and a way to join. Signed in: accept (which pairs you straight away), or,
// when neither of you has Premium, say you're in so it starts once either
// upgrades. The key decides everything; the username is only for reading.
// Rules: supabase/migrations/20260926160000_watch_together_free.sql.
// Mobile parity: not built yet; tracked in the Watch together PR.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName } from '@plot/core/watchTogether.js';
import { watchTogetherLinkOwner, watchTogetherLinkStatus, acceptWatchTogetherLink } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { rememberReturnPath } from '../utils/authReturn.js';
import { AcceptDialog, PersonAvatar } from './WatchTogetherParts.jsx';
import { InviteLinkCard, Wordmark } from './WatchTogetherStart.jsx';
import './WatchTogetherView.css';

const L = T.landing;

export default function WatchTogetherLinkPage() {
  const { user, profile } = useApp();
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(/** @type {any} */ (undefined));
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    let live = true;
    (userId ? watchTogetherLinkStatus(key) : watchTogetherLinkOwner(key))
      .then(data => { if (live) setInfo(data); }, () => { if (live) setInfo(null); });
    return () => { live = false; };
  }, [key, userId]);

  if (info === undefined) return <div className="wt-page" />;

  if (!info) {
    return (
      <div className="wt-page wt-landing">
        <h1 className="wt-title">{L.invalidTitle}</h1>
        <p className="wt-card-body">{L.invalidBody}</p>
      </div>
    );
  }

  const name = personName(info);
  const here = `/watch-with/${encodeURIComponent(info.username)}/${encodeURIComponent(key)}`;
  const go = (path) => { rememberReturnPath(here); navigate(path); };

  if (!userId) {
    return (
      <div className="wt-page wt-landing">
        <PersonAvatar person={info} size="lg" />
        <h1 className="wt-title">{L.titleNewLead(name)} <Wordmark /></h1>
        <p className="wt-card-body">{L.bodyNew(name)}</p>
        <div className="wt-top-actions">
          <button type="button" className="btn btn-primary" onClick={() => go('/signup')}>{L.joinLead} <Wordmark /> {L.joinTail}</button>
          <button type="button" className="btn btn-secondary" onClick={() => go('/login')}>{L.haveAccount}</button>
        </div>
        <p className="wt-note">{L.newNote(name)}</p>
      </div>
    );
  }

  if (info.state === 'self') {
    return (
      <div className="wt-page wt-landing">
        <h1 className="wt-title">{L.selfTitle}</h1>
        <p className="wt-card-body">{L.selfBody}</p>
        <InviteLinkCard compact />
      </div>
    );
  }

  const togetherPath = `/together/with/${encodeURIComponent(info.username)}`;
  if (info.state === 'paired') {
    return (
      <div className="wt-page wt-landing">
        <PersonAvatar person={info} size="lg" />
        <h1 className="wt-title">{L.pairedTitle(name)}</h1>
        <div><Link to={togetherPath} className="btn btn-primary">{T.tile.pairedAction}</Link></div>
      </div>
    );
  }

  const accept = async (shareFull) => {
    setBusy(true); setError(null);
    const result = await acceptWatchTogetherLink(key, shareFull);
    setBusy(false);
    setReviewing(false);
    if (result.ok) navigate(togetherPath, { replace: true });
    else setError(T.errors[result.code]);
  };

  return (
    <div className="wt-page wt-landing">
      <PersonAvatar person={info} size="lg" />
      <h1 className="wt-title">{L.title(name)}</h1>
      <p className="wt-card-body">{info.can_decide ? L.body : L.bodyNoPremium(name)}</p>
      {error && <p className="wt-error" role="alert">{error}</p>}
      <div className="wt-top-actions">
        {info.can_decide ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => setReviewing(true)} disabled={busy}>{L.accept}</button>
            <Link to="/together" className="btn btn-secondary">{L.notNow}</Link>
          </>
        ) : (
          <>
            <Link to={premiumPlansPath(here)} className="btn btn-primary">{T.start.getPremium}</Link>
            <button type="button" className="btn btn-secondary" onClick={() => setReviewing(true)} disabled={busy}>{L.imIn(name)}</button>
          </>
        )}
      </div>
      <p className="wt-note">{info.can_decide ? L.acceptNote(name) : L.imInNote}</p>
      {reviewing && (
        <AcceptDialog person={info} viewerIsPublic={!!profile?.is_public} busy={busy}
          onClose={() => setReviewing(false)}
          onDecline={() => setReviewing(false)}
          onAccept={accept} />
      )}
    </div>
  );
}
