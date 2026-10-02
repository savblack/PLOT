// Where a collaborative list invite lands: /join-list/:key. Public, so someone
// without an account can open it. Signed out: whose list it is and a way to
// join Plot. Signed in: join the list, free, as long as its owner has Premium.
// The key decides everything. Rules: packages/core/listInvites.js and
// supabase/migrations/20261001140000_collaborative_list_invites.sql.
// Layout (Savannah's picks, 2 Oct 2026): a list with no titles yet leads
// with the person who sent it (canvas A3, A4, A7); once it has titles it
// leads with the list, its people and a peek at its posters (B3, B4, B7).
// The same page serves desktop and phone.
// Mobile parity: not built yet; tracked in issue 1089.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName } from '@plot/core/watchTogether.js';
import { listInviteLanding } from '@plot/core/listInvites.js';
import { listInvitePreview, listInvitePeek, acceptListInvite } from '@plot/core/useListInvites.js';
import { inviteLandingLayout } from '@plot/core/sharedLists.js';
import { posterUrl } from '../utils/images.js';
import ListCover from './ListCover.jsx';
import { MemberStack } from './CollaborativeListParts.jsx';
import { collectionPath, customListKey } from '@plot/core/listCollections.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { rememberReturnPath } from '../utils/authReturn.js';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import { Wordmark } from './WatchTogetherStart.jsx';
import './WatchTogetherView.css';

const L = C.landing;

/**
 * The list-led head (B3, B4, B7): "Mia invited you to join", the list's
 * name, everyone on it, and its newest posters (a row on wide screens, the
 * cover fan on a phone).
 *
 * @param {{ info: import('@plot/core/listInvites.js').ListInvitePreview, peek: import('@plot/core/useListInvites.js').ListInvitePeek, name: string }} props
 */
export function ListInviteListHead({ info, peek, name }) {
  const people = [info, ...peek.members];
  const names = people.map(personName);
  const more = Math.max(0, peek.member_count - peek.members.length);
  const summary = L.members(names, more, info.item_count ?? 0);
  return (
    <>
      {peek.posters.length > 0 && (
        <div className="cl-landing-fan" aria-hidden="true">
          <ListCover name={info.list_name} posters={peek.posters} labelled={false} />
        </div>
      )}
      <p className="cl-landing-kicker">{L.invitedToJoin(name)}</p>
      <h1 className="wt-title">{info.list_name}</h1>
      <p className="cl-landing-people" aria-label={summary}>
        <MemberStack people={people} max={4} size="sm" />
        <span aria-hidden="true">{summary}</span>
      </p>
      {peek.posters.length > 0 && (
        <div className="cl-landing-posters" aria-hidden="true">
          {peek.posters.map((path, i) => <img key={i} src={posterUrl(path, 'w185')} alt="" loading="lazy" />)}
        </div>
      )}
    </>
  );
}

/**
 * @param {{ loadPreview?: typeof listInvitePreview, loadPeek?: typeof listInvitePeek }} [props]
 *   The two reads, replaceable so Storybook can show every state without a server.
 */
export default function ListInvitePage({ loadPreview = listInvitePreview, loadPeek = listInvitePeek } = {}) {
  const { user, customLists } = useApp();
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(/** @type {any} */ (undefined));
  const [peek, setPeek] = useState(/** @type {any} */ (undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const userId = user?.id;

  useEffect(() => {
    let live = true;
    loadPreview(key).then(data => { if (live) setInfo(data); }, () => { if (live) setInfo(null); });
    loadPeek(key).then(data => { if (live) setPeek(data); }, () => { if (live) setPeek(null); });
    return () => { live = false; };
  }, [key, userId, loadPreview, loadPeek]);

  // Wait for both, so the layout doesn't switch under the reader.
  if (info === undefined || peek === undefined) return <div className="wt-page" />;

  const screen = listInviteLanding(info, { signedIn: !!userId });
  if (screen === 'invalid') {
    return (
      <div className="wt-page wt-landing">
        <h1 className="wt-title">{T.landing.invalidTitle}</h1>
        <p className="wt-card-body">{T.landing.invalidBody}</p>
      </div>
    );
  }

  const name = personName(info);
  const summary = T.sharedList.summary(info.list_name, info.item_count ?? 0);
  const here = `/join-list/${encodeURIComponent(key)}`;
  const go = (path) => { rememberReturnPath(here); navigate(path); };
  // The list-led layout needs the peek; without it (an older server, a failed
  // read) the person-led one still says everything that matters.
  const listLed = inviteLandingLayout(info) === 'list' && !!peek;
  const openList = (id) => navigate(collectionPath(customListKey(id)), { replace: true });

  if (screen === 'signedOut') {
    return (
      <div className={`wt-page wt-landing cl-landing${listLed ? ' cl-landing--list' : ''}`}>
        {listLed ? <ListInviteListHead info={info} peek={peek} name={name} /> : (
          <>
            <PersonAvatar person={info} size="lg" />
            <h1 className="wt-title">{L.title(name)}</h1>
            <p className="wt-person-name">{summary}</p>
          </>
        )}
        <p className="wt-card-body">{listLed ? L.listBody : L.bodyNew(name)}</p>
        <div className="wt-top-actions">
          <button type="button" className="btn btn-primary" onClick={() => go('/signup')}>{T.landing.joinLead} <Wordmark /> {T.landing.joinTail}</button>
          <button type="button" className="btn btn-secondary" onClick={() => go('/login')}>{T.landing.haveAccount}</button>
        </div>
        <p className="wt-note">{T.landing.newNote(name)}</p>
      </div>
    );
  }

  if (screen === 'owner' || screen === 'member') {
    return (
      <div className="wt-page wt-landing">
        <h1 className="wt-title">{screen === 'owner' ? L.ownerTitle : L.memberTitle}</h1>
        <p className="wt-person-name">{summary}</p>
        {screen === 'owner' && <p className="wt-card-body">{L.ownerBody}</p>}
        <div><button type="button" className="btn btn-primary" onClick={() => openList(info.list_id)}>{L.open}</button></div>
      </div>
    );
  }

  if (screen === 'inactive') {
    return (
      <div className="wt-page wt-landing">
        <PersonAvatar person={info} size="lg" />
        <h1 className="wt-title">{L.inactiveTitle}</h1>
        <p className="wt-card-body">{L.inactiveBody(name)}</p>
      </div>
    );
  }

  const join = async () => {
    setBusy(true); setError(null);
    const result = await acceptListInvite(key);
    if (!result.ok) { setBusy(false); setError(C.errors[result.code] || T.errors.generic); return; }
    // Load the list into My Lists before opening it, so its page can find it.
    await customLists.refresh();
    openList(result.listId);
  };

  return (
    <div className={`wt-page wt-landing cl-landing${listLed ? ' cl-landing--list' : ''}`}>
      {listLed ? <ListInviteListHead info={info} peek={peek} name={name} /> : (
        <>
          <PersonAvatar person={info} size="lg" />
          <h1 className="wt-title">{L.title(name)}</h1>
          <p className="wt-person-name">{summary}</p>
        </>
      )}
      <p className="wt-card-body">{listLed ? L.listBody : L.body}</p>
      {error && <p className="wt-error" role="alert">{error}</p>}
      <div className="wt-top-actions">
        <button type="button" className="btn btn-primary" onClick={join} disabled={busy}>{L.join}</button>
        <Link to="/my-lists" className="btn btn-secondary">{T.landing.notNow}</Link>
      </div>
      <p className="wt-note">{listLed ? L.whereNote(name) : L.joinNote(name)}</p>
    </div>
  );
}
