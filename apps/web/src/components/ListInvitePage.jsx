// Where a collaborative list invite lands: /join-list/:key. Public, so someone
// without an account can open it. Signed out: whose list it is and a way to
// join Plot. Signed in: join the list, free, as long as its owner has Premium.
// The key decides everything. Rules: packages/core/listInvites.js and
// supabase/migrations/20261001110000_collaborative_list_invites.sql.
// Mobile parity: not built yet; tracked in issue 1089.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName } from '@plot/core/watchTogether.js';
import { listInviteLanding } from '@plot/core/listInvites.js';
import { listInvitePreview, acceptListInvite } from '@plot/core/useListInvites.js';
import { collectionPath, customListKey } from '@plot/core/listCollections.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { rememberReturnPath } from '../utils/authReturn.js';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import { Wordmark } from './WatchTogetherStart.jsx';
import './WatchTogetherView.css';

const L = C.landing;

export default function ListInvitePage() {
  const { user, customLists } = useApp();
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(/** @type {any} */ (undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const userId = user?.id;

  useEffect(() => {
    let live = true;
    listInvitePreview(key).then(data => { if (live) setInfo(data); }, () => { if (live) setInfo(null); });
    return () => { live = false; };
  }, [key, userId]);

  if (info === undefined) return <div className="wt-page" />;

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
  const openList = (id) => navigate(collectionPath(customListKey(id)), { replace: true });

  if (screen === 'signedOut') {
    return (
      <div className="wt-page wt-landing">
        <PersonAvatar person={info} size="lg" />
        <h1 className="wt-title">{L.title(name)}</h1>
        <p className="wt-person-name">{summary}</p>
        <p className="wt-card-body">{L.bodyNew(name)}</p>
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
    <div className="wt-page wt-landing">
      <PersonAvatar person={info} size="lg" />
      <h1 className="wt-title">{L.title(name)}</h1>
      <p className="wt-person-name">{summary}</p>
      <p className="wt-card-body">{L.body}</p>
      {error && <p className="wt-error" role="alert">{error}</p>}
      <div className="wt-top-actions">
        <button type="button" className="btn btn-primary" onClick={join} disabled={busy}>{L.join}</button>
        <Link to="/my-lists" className="btn btn-secondary">{T.landing.notNow}</Link>
      </div>
      <p className="wt-note">{L.joinNote(name)}</p>
    </div>
  );
}
