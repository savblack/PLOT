// Collaborative lists (PLO-525) on web: the Invite people dialog, the ways in
// (a list's ⋯ menu, New shared list, Start a list from a profile) and the
// shared list page's people panel and phone sheet. The invite link lets
// anyone join for free; people you already watch together with can be added
// straight away. Rules and data live in @plot/core (listInvites.js,
// sharedLists.js, useListInvites.js). Mobile parity: not built yet; tracked
// in issue 1089.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import KebabMenu from './KebabMenu.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import { PersonAvatar, SharedListPeopleDialog } from './WatchTogetherParts.jsx';
import { useApp } from '../hooks/useApp.js';
import { useShare } from '../hooks/useShare.js';
import { useWatchTogether } from '@plot/core/useWatchTogether.js';
import { useListInvite, useListHostPremium, reportListInviteShared } from '@plot/core/useListInvites.js';
import { listInviteAction } from '@plot/core/listInvites.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { personName } from '@plot/core/watchTogether.js';
import { isListShareable, listVisibility } from '@plot/core/customLists.js';
import { buildListInviteUrl, buildListShareUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { collectionPath, customListKey } from '@plot/core/listCollections.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { COMMON } from '../copy/common.js';
import { EVENTS, track } from '../lib/analytics.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { shareUrl } from '../utils/share.js';
import './WatchTogetherView.css';
import './CollaborativeLists.css';

const P = C.page;

/** Links point at the host you're on for previews (they use Staging's data). */
function linkOrigin() {
  return isPreviewDeployment() && typeof window !== 'undefined' ? window.location.origin : SHARE_ORIGIN;
}

export function PeopleIcon() {
  return (
    <svg className="cl-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.6M17 13.6A5.5 5.5 0 0 1 20.5 19" />
    </svg>
  );
}

export function SofaIcon() {
  return (
    <svg className="cl-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
      <path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M6 19v2M18 19v2" />
    </svg>
  );
}

export function PlusSmallIcon() {
  return <svg className="cl-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

/**
 * Overlapping initials (or photos), the small stack the canvas puts beside
 * every shared list.
 *
 * @param {{ people: { user_id?: string, display_name?: string | null, username?: string | null, avatar_url?: string | null }[], max?: number, size?: 'xs' | 'sm' }} props
 */
export function MemberStack({ people, max = 3, size = 'xs' }) {
  return (
    <span className={`wt-stack cl-stack cl-stack--${size}`} aria-hidden="true">
      {(people || []).slice(0, max).map((p, i) => <PersonAvatar key={p.user_id || i} person={p} size={size} />)}
    </span>
  );
}

/**
 * @param {{ list: { id: string, name: string, people?: { user_id: string }[] }, onClose: () => void }} props
 */
export function ListInviteDialog({ list, onClose }) {
  const { user, customLists } = useApp();
  const { key, code, reset } = useListInvite(list.id);
  const { partners } = useWatchTogether(user?.id);
  const [copied, setCopied] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [added, setAdded] = useState(() => new Set());
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const url = buildListInviteUrl({ key: key || '', origin: linkOrigin() });
  const display = url ? url.replace(/^https?:\/\//, '') : '';
  const onList = new Set((list.people || []).map(p => p.user_id));
  const candidates = partners.filter(p => !onList.has(p.other_id));
  const linkError = code ? (C.errors[code] || T.errors.generic) : null;

  const share = async () => {
    if (!url) return;
    const result = await shareUrl({ url, title: C.dialog.shareTitle(list.name), text: C.dialog.shareText });
    if (result.ok) reportListInviteShared(result.method);
    if (result.ok && result.method === 'copy') setCopied(true);
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); reportListInviteShared('copy'); } catch { /* clipboard blocked */ }
  };
  const add = async (id) => {
    setError(null);
    if (await customLists.addMember(list.id, id)) setAdded(prev => new Set(prev).add(id));
    else setError(T.errors.generic);
  };

  return (
    <ResponsiveDialog title={C.invite} onClose={onClose}>
      <div className="wt-accept">
        <p className="wt-note">{C.dialog.body}</p>
        <div className="wt-settings-group">
          <span className="wt-accept-label">{T.link.kicker}</span>
          {linkError
            ? <p className="wt-error" role="alert">{linkError}</p>
            : (
              <div className="wt-linkrow">
                <span className="wt-linkurl">{display}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{T.link.share}</button>
              </div>
            )}
          {!linkError && (
            <div className="wt-person">
              <span className="wt-person-text"><span className="wt-note">{C.dialog.resetNote}</span></span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!key || resetDone}
                onClick={async () => { const r = await reset(); if (r.ok) { setResetDone(true); setCopied(false); } }}>{T.link.reset}</button>
            </div>
          )}
        </div>
        {candidates.length > 0 && (
          <div className="wt-settings-group">
            <span className="wt-accept-label">{C.dialog.partnersLabel}</span>
            <span className="wt-note">{C.dialog.partnersNote}</span>
            {candidates.map(p => (
              <div key={p.other_id} className="wt-row">
                <PersonAvatar person={p} />
                <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span></span>
                {added.has(p.other_id)
                  ? <span className="wt-chip wt-chip--ok">{T.sharedList.shared}</span>
                  : <button type="button" className="btn btn-primary btn-sm" onClick={() => add(p.other_id)}>{T.sharedList.add}</button>}
              </div>
            ))}
          </div>
        )}
        {error && <p className="wt-error" role="alert">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * What "Invite people" opens for this viewer, from any way in (a cover's ⋯,
 * the list page's panel, the phone people sheet). The rules are
 * listInviteAction's: a Premium owner gets the invite dialog, a Free owner
 * the upgrade sheet, a member adds partners while the owner has Premium.
 *
 * @param {{ list: any, onClose: () => void }} props
 */
export function InvitePeopleFlow({ list, onClose }) {
  const { profile, customLists } = useApp();
  const isOwner = list.role !== 'member';
  const hostPremium = useListHostPremium(list.id, { enabled: !isOwner });
  const ready = isOwner || hostPremium !== null;
  const action = ready ? listInviteAction({ isOwner, viewerPremium: isPremiumProfile(profile), hostPremium }) : null;
  useEffect(() => {
    if (action === 'upgrade') track(EVENTS.PREMIUM_GATE_HIT, { feature: 'collaborative_lists' });
  }, [action]);
  if (!action) return null;
  if (action === 'upgrade') return <UpgradeSheet reason="collaborativeLists" onClose={onClose} />;
  if (action === 'invite') return <ListInviteDialog list={list} onClose={onClose} />;
  return <SharedListPeopleDialog list={list} locked={hostPremium !== true} onAdd={memberId => customLists.addMember(list.id, memberId)} onClose={onClose} />;
}

/** @param {{ list: { id: string, name: string }, onClose: () => void }} props */
export function RenameListDialog({ list, onClose }) {
  const { customLists } = useApp();
  const [name, setName] = useState(list.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await customLists.renameList(list.id, name);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <ResponsiveDialog title={C.myLists.renameTitle} onClose={onClose}
      footer={<div className="wt-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{COMMON.cancel}</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>{COMMON.save}</button>
      </div>}>
      <form className="wt-accept" onSubmit={e => { e.preventDefault(); save(); }}>
        <label className="wt-field">
          <span className="wt-accept-label">{C.create.name}</span>
          <input type="text" className="wt-search" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </label>
      </form>
    </ResponsiveDialog>
  );
}

/**
 * The ⋯ on a list cover in My Lists (canvas A1): rename, invite people,
 * share and delete for your own lists; rename, add people and leave for one
 * you joined. Each action opens its sheet in place.
 *
 * @param {{ list: any }} props
 */
export function ListCoverMenu({ list }) {
  const { profile, customLists } = useApp();
  const { share } = useShare();
  const [open, setOpen] = useState(/** @type {null | 'rename' | 'invite' | 'delete' | 'leave'} */ (null));
  const isOwner = list.role !== 'member';
  const shareable = isOwner && isListShareable(listVisibility(list), profile?.is_public);
  const count = (list.items || []).length;
  const close = () => setOpen(null);

  const items = [
    { label: C.myLists.rename, onClick: () => setOpen('rename') },
    ...(SHOW_WATCH_TOGETHER ? [{ label: isOwner ? C.invite : T.sharedList.addPeople, onClick: () => setOpen('invite') }] : []),
    ...(shareable ? [{
      label: C.myLists.share,
      onClick: () => share({ url: buildListShareUrl({ listId: list.id }), title: `${list.name} · Plot`, text: SHARING.listText(list.name), event: EVENTS.LIST_SHARED, eventProps: { list_id: list.id } }),
    }] : []),
    isOwner
      ? { label: C.myLists.delete, onClick: () => setOpen('delete'), danger: true }
      : { label: T.sharedList.leave, onClick: () => setOpen('leave'), danger: true },
  ];

  return (
    <>
      <KebabMenu ariaLabel={C.myLists.listOptions(list.name)} items={items} buttonClassName="list-options-btn list-cover-menu-btn" />
      {open === 'rename' && <RenameListDialog list={list} onClose={close} />}
      {open === 'invite' && <InvitePeopleFlow list={list} onClose={close} />}
      {open === 'leave' && (
        <ConfirmModal
          title={T.sharedList.leaveTitle(list.name)}
          message={T.sharedList.leaveBody}
          confirmLabel={T.sharedList.leave}
          danger
          onConfirm={async () => { await customLists.leaveList(list.id); close(); }}
          onClose={close}
        />
      )}
      {open === 'delete' && (
        <ConfirmModal
          title={`Delete "${list.name}"?`}
          message={count > 0 ? `This list has ${count} title${count === 1 ? '' : 's'}. This can't be undone.` : "This can't be undone."}
          confirmLabel={C.myLists.delete}
          danger
          onConfirm={async () => { await customLists.deleteList(list.id); close(); }}
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * New shared list (canvas B2): name it and pick people you watch together
 * with. The invite link needs the list to exist, so Create makes it and then
 * opens the same Invite people dialog every other way in uses. Premium only;
 * My Lists opens the upgrade sheet for Free accounts before this.
 *
 * @param {{ onClose: () => void, partners?: any[] }} props  `partners` for stories
 */
export function NewSharedListDialog({ onClose, partners: givenPartners }) {
  const navigate = useNavigate();
  const { user, customLists } = useApp();
  const wt = useWatchTogether(givenPartners ? undefined : user?.id);
  const partners = givenPartners || wt.partners || [];
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [created, setCreated] = useState(/** @type {any} */ (null));

  if (created) {
    const list = customLists.lists?.find(l => l.id === created.id) || created;
    return <ListInviteDialog list={list} onClose={() => { onClose(); navigate(collectionPath(customListKey(created.id))); }} />;
  }

  const toggle = (id) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const pickedNames = partners.filter(p => picked.has(p.other_id)).map(personName);
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const id = picked.size
        ? await customLists.createSharedList(name, [...picked])
        : (await customLists.createList(name))?.id;
      if (id) setCreated({ id, name: name.trim(), role: 'owner', people: [] });
      else setError(T.errors.generic);
    } catch {
      setError(T.errors.generic);
    }
    setBusy(false);
  };

  return (
    <ResponsiveDialog title={C.create.title} onClose={onClose}
      footer={<div className="wt-dialog-actions cl-create-foot">
        <span className="wt-note">{pickedNames.length ? C.create.notify(pickedNames) : C.create.linkNote}</span>
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !name.trim()}>{C.create.create}</button>
      </div>}>
      <form className="wt-accept" onSubmit={e => { e.preventDefault(); create(); }}>
        <label className="wt-field">
          <span className="wt-accept-label">{C.create.name}</span>
          <input type="text" className="wt-search" value={name} placeholder={C.create.namePlaceholder} onChange={e => setName(e.target.value)} autoFocus />
        </label>
        {partners.length > 0 && (
          <div className="wt-settings-group">
            <span className="wt-accept-label">{C.create.people}</span>
            <span className="wt-note">{C.create.peopleNote}</span>
            {partners.map(p => (
              <div key={p.other_id} className="wt-row">
                <PersonAvatar person={p} />
                <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span>{p.username && <span className="wt-note">@{p.username}</span>}</span>
                {picked.has(p.other_id)
                  ? <button type="button" className="wt-chip wt-chip--ok cl-chip-btn" aria-pressed="true" onClick={() => toggle(p.other_id)}>{C.create.added}</button>
                  : <button type="button" className="btn btn-primary btn-sm" aria-pressed="false" onClick={() => toggle(p.other_id)}>{T.sharedList.add}</button>}
              </div>
            ))}
          </div>
        )}
        {error && <p className="wt-error" role="alert">{error}</p>}
      </form>
    </ResponsiveDialog>
  );
}

/**
 * The people panel at the top of a shared list's left column: A5's header
 * (avatar stack, "You, Sam, Priya and Jo · 12 titles") merged into B5's "On
 * this list" card and made smaller. Each person's row is also the Added by
 * filter; pressing it again shows everyone.
 *
 * @param {{ members: import('@plot/core/sharedLists.js').ListMember[], total: number,
 *   filter: string | null, onFilter: (id: string | null) => void, onInvite: () => void, inviteLabel: string }} props
 */
export function ListPeoplePanel({ members, total, filter, onFilter, onInvite, inviteLabel }) {
  const names = members.map(m => (m.isYou ? P.you : personName(m)));
  return (
    <section className="hist-card cl-people" aria-label={P.onThisList}>
      <div className="cl-people-summary">
        <MemberStack people={members} max={4} />
        <span className="cl-people-names">{P.summary(names, total)}</span>
      </div>
      <div className="cl-people-rows" role="group" aria-label={P.filterBy}>
        <span className="cl-people-kicker">{P.filterBy}</span>
        {members.map((m, i) => (
          <button
            key={m.user_id}
            type="button"
            className="cal-filter-row cl-people-row"
            aria-pressed={filter === m.user_id}
            title={P.filterHint(names[i])}
            onClick={() => onFilter(filter === m.user_id ? null : m.user_id)}
          >
            <span className="cal-filter-name">{names[i]}</span>
            <span className="cl-people-count">{m.isOwner ? P.ownerCount(m.count) : m.count}</span>
          </button>
        ))}
      </div>
      <div><button type="button" className="btn btn-secondary btn-sm cl-invite-btn" onClick={onInvite}><PeopleIcon />{inviteLabel}</button></div>
    </section>
  );
}

/**
 * The phone list's people line (A8): the avatar stack and "4 people · 12
 * titles", which opens the people sheet. Add is a round control in the
 * toolbar beside grid, list and sort.
 *
 * @param {{ members: import('@plot/core/sharedLists.js').ListMember[], total: number, onOpen: () => void }} props
 */
export function ListPeopleLine({ members, total, onOpen }) {
  return (
    <div className="cl-lead">
      <button type="button" className="cl-lead-people" onClick={onOpen} aria-label={P.peopleButton(members.length)} aria-haspopup="dialog">
        <MemberStack people={members} max={4} />
        <span>{P.countSummary(members.length, total)}</span>
      </button>
    </div>
  );
}

/**
 * Tapping the people on the phone list: who is on it and how many titles
 * each person added, with Add a person and Watch together.
 *
 * @param {{ members: import('@plot/core/sharedLists.js').ListMember[], onInvite: () => void, onWatchTogether: (() => void) | null, onClose: () => void }} props
 */
export function ListPeopleSheet({ members, onInvite, onWatchTogether, onClose }) {
  return (
    <ResponsiveDialog title={P.onThisList} onClose={onClose}
      footer={<div className="wt-dialog-actions cl-sheet-actions">
        <button type="button" className="btn btn-secondary" onClick={onInvite}><PeopleIcon />{P.addPerson}</button>
        {onWatchTogether && <button type="button" className="btn btn-primary" onClick={onWatchTogether}><SofaIcon />{T.navLabel}</button>}
      </div>}>
      <div className="wt-accept cl-people-sheet">
        {members.map(m => (
          <div key={m.user_id} className="wt-row">
            <PersonAvatar person={m} />
            <span className="wt-person-text">
              <span className="wt-person-name">{m.isYou ? P.you : personName(m)}</span>
              <span className="wt-note">{P.added(m.count)}</span>
            </span>
            {m.isOwner && <span className="wt-chip">{P.owner}</span>}
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
